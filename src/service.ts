import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";
import { GraphClient, GraphError } from "./graph.js";
import { verifySignature } from "./hmac.js";
import { lintTemplate, type TemplateInput } from "./lint/index.js";
import { isStopKeyword, normalizePhone } from "./optin.js";
import type { Store } from "./store.js";
import { windowState } from "./window.js";

export type Refusal = {
  ok: false;
  refused: true;
  code: string;
  reason: string;
};
export type Failure = {
  ok: false;
  refused?: false;
  code: string;
  reason: string;
  status?: number;
  detail?: unknown;
};

const refuse = (code: string, reason: string): Refusal => ({
  ok: false,
  refused: true,
  code,
  reason,
});

export interface ServiceDeps {
  config: Config;
  store: Store;
  now?: () => number;
  fetchFn?: typeof fetch;
}

export class WhatsAppService {
  readonly cfg: Config;
  readonly store: Store;
  private now: () => number;
  private graph: GraphClient;

  constructor(deps: ServiceDeps) {
    this.cfg = deps.config;
    this.store = deps.store;
    this.now = deps.now ?? Date.now;
    this.graph = new GraphClient(deps.config, deps.fetchFn ?? fetch);
  }

  // ---------- guards ----------

  private checkOptIn(phone: string): Refusal | null {
    if (!this.cfg.requireOptIn) return null;
    const o = this.store.getOptIn(phone);
    if (!o)
      return refuse(
        "no_opt_in",
        `No opt-in on record for ${phone}. Call record_optin first (with the real consent source).`,
      );
    if (!o.optedIn)
      return refuse(
        "opted_out",
        `${phone} revoked opt-in at ${new Date(o.revokedAt ?? o.ts).toISOString()}. Not sending.`,
      );
    return null;
  }

  private checkCaps(): Refusal | null {
    const t = this.now();
    const day = this.store.countOutSince(t - 24 * 3600 * 1000);
    if (day >= this.cfg.dailySendCap)
      return refuse(
        "daily_cap",
        `Daily send cap reached (${day}/${this.cfg.dailySendCap} in the last 24h).`,
      );
    const min = this.store.countOutSince(t - 60 * 1000);
    if (min >= this.cfg.minuteRateCap)
      return refuse(
        "rate_cap",
        `Per-minute rate cap reached (${min}/${this.cfg.minuteRateCap}). Retry in under a minute.`,
      );
    return null;
  }

  private creds(needWaba = false): Refusal | null {
    if (!this.cfg.token)
      return refuse("missing_credentials", "WHATSAPP_TOKEN is not set.");
    if (needWaba ? !this.cfg.wabaId : !this.cfg.phoneNumberId) {
      return refuse(
        "missing_credentials",
        needWaba
          ? "WHATSAPP_WABA_ID is not set."
          : "WHATSAPP_PHONE_NUMBER_ID is not set.",
      );
    }
    return null;
  }

  private async dispatch(payload: unknown, phone: string, label: string) {
    if (this.cfg.dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        wouldSend: { method: "POST", url: this.graph.messagesUrl(), payload },
      };
    }
    const c = this.creds();
    if (c) return c;
    try {
      const res = await this.graph.send(payload);
      const id: string = res?.messages?.[0]?.id ?? `local-${randomUUID()}`;
      this.store.addMessage({
        id,
        phone,
        direction: "out",
        body: label,
        ts: this.now(),
      });
      return {
        ok: true as const,
        dryRun: false as const,
        messageId: id,
        response: res,
      };
    } catch (e) {
      return this.graphFailure(e);
    }
  }

  private graphFailure(e: unknown): Failure {
    if (e instanceof GraphError) {
      const msg = (e.body as any)?.error?.message ?? `HTTP ${e.status}`;
      return {
        ok: false,
        code: "graph_error",
        status: e.status,
        reason: msg,
        detail: e.body,
      };
    }
    return {
      ok: false,
      code: "network_error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  // ---------- tools ----------

  async sendTemplate(
    to: string,
    name: string,
    lang: string,
    params: string[] = [],
  ) {
    const phone = normalizePhone(to);
    if (!phone)
      return refuse(
        "bad_phone",
        `"${to}" is not a valid phone number (need 7-15 digits, country code included).`,
      );
    if (!name?.trim()) return refuse("bad_input", "Template name is required.");
    const oi = this.checkOptIn(phone);
    if (oi) return oi;
    const caps = this.checkCaps();
    if (caps) return caps;
    const payload = this.graph.buildTemplatePayload(phone, name, lang, params);
    return this.dispatch(payload, phone, `[template:${name}]`);
  }

  async sendText(to: string, body: string) {
    const phone = normalizePhone(to);
    if (!phone)
      return refuse(
        "bad_phone",
        `"${to}" is not a valid phone number (need 7-15 digits, country code included).`,
      );
    if (!body?.trim()) return refuse("bad_input", "Message body is empty.");
    if ([...body].length > 4096)
      return refuse("bad_input", "Text body exceeds 4096 characters.");
    const oi = this.checkOptIn(phone);
    if (oi) return oi;
    const w = windowState(this.store.lastInboundAt(phone), this.now());
    if (!w.open) {
      return refuse(
        "window_closed",
        w.lastInboundAt
          ? `The 24h customer-service window closed at ${w.expiresAt}. Free-form text is not allowed; send an approved template instead.`
          : `${phone} has never messaged this number, so there is no open 24h window. Send an approved template instead.`,
      );
    }
    const caps = this.checkCaps();
    if (caps) return caps;
    return this.dispatch(this.graph.buildTextPayload(phone, body), phone, body);
  }

  checkWindow(to: string) {
    const phone = normalizePhone(to);
    if (!phone)
      return refuse("bad_phone", `"${to}" is not a valid phone number.`);
    const w = windowState(this.store.lastInboundAt(phone), this.now());
    const o = this.store.getOptIn(phone);
    return {
      ok: true as const,
      phone,
      window: w,
      optedIn: !!o?.optedIn,
      canSendFreeText: w.open && (!this.cfg.requireOptIn || !!o?.optedIn),
      canSendTemplate: !this.cfg.requireOptIn || !!o?.optedIn,
    };
  }

  async listTemplates() {
    const c = this.creds(true);
    if (c) return c;
    try {
      const res = await this.graph.listTemplates();
      return { ok: true as const, templates: res.data ?? [] };
    } catch (e) {
      return this.graphFailure(e);
    }
  }

  async getTemplate(name: string) {
    const c = this.creds(true);
    if (c) return c;
    try {
      const res = await this.graph.getTemplate(name);
      const t = (res.data ?? []).filter((x: any) => x.name === name);
      if (!t.length) return refuse("not_found", `No template named "${name}".`);
      return { ok: true as const, templates: t };
    } catch (e) {
      return this.graphFailure(e);
    }
  }

  lintTemplate(input: TemplateInput) {
    return { ok: true as const, ...lintTemplate(input) };
  }

  recordOptin(to: string, source: string, ts?: string | number) {
    const phone = normalizePhone(to);
    if (!phone)
      return refuse("bad_phone", `"${to}" is not a valid phone number.`);
    if (!source?.trim())
      return refuse(
        "bad_input",
        "source is required (where/how the user consented, e.g. 'web-form 2026-10-01').",
      );
    const t =
      ts === undefined
        ? this.now()
        : typeof ts === "number"
          ? ts
          : Date.parse(ts);
    if (!Number.isFinite(t))
      return refuse(
        "bad_input",
        "ts must be an ISO date or epoch milliseconds.",
      );
    this.store.setOptIn({ phone, optedIn: true, source: source.trim(), ts: t });
    return {
      ok: true as const,
      phone,
      optedIn: true,
      source: source.trim(),
      ts: new Date(t).toISOString(),
    };
  }

  revokeOptin(to: string) {
    const phone = normalizePhone(to);
    if (!phone)
      return refuse("bad_phone", `"${to}" is not a valid phone number.`);
    const prev = this.store.getOptIn(phone);
    const t = this.now();
    this.store.setOptIn({
      phone,
      optedIn: false,
      source: prev?.source ?? "revoked",
      ts: prev?.ts ?? t,
      revokedAt: t,
    });
    return {
      ok: true as const,
      phone,
      optedIn: false,
      revokedAt: new Date(t).toISOString(),
    };
  }

  readConversation(to: string, limit = 20) {
    const phone = normalizePhone(to);
    if (!phone)
      return refuse("bad_phone", `"${to}" is not a valid phone number.`);
    const n = Math.min(200, Math.max(1, Math.floor(limit || 20)));
    const msgs = this.store
      .listMessages(phone, n)
      .map((m) => ({ ...m, at: new Date(m.ts).toISOString() }));
    return { ok: true as const, phone, count: msgs.length, messages: msgs };
  }

  ingestWebhook(
    payload: unknown,
    signature: string | undefined,
    rawBody: string,
  ) {
    if (!this.cfg.appSecret)
      return refuse(
        "no_app_secret",
        "WHATSAPP_APP_SECRET is not set; refusing to ingest unverified webhooks.",
      );
    if (typeof rawBody !== "string" || !rawBody)
      return refuse(
        "bad_input",
        "rawBody (the exact bytes Meta sent, as a string) is required.",
      );
    if (!verifySignature(rawBody, signature, this.cfg.appSecret)) {
      return refuse(
        "invalid_signature",
        "X-Hub-Signature-256 does not match the raw body. Payload ignored.",
      );
    }
    let parsed: any;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return refuse("bad_input", "rawBody is not valid JSON.");
    }
    if (
      payload !== undefined &&
      payload !== null &&
      stable(payload) !== stable(parsed)
    ) {
      return refuse(
        "payload_mismatch",
        "payload does not match the signed rawBody. Payload ignored.",
      );
    }
    let messages = 0,
      statuses = 0,
      duplicates = 0,
      optOuts = 0;
    for (const entry of parsed?.entry ?? []) {
      for (const ch of entry?.changes ?? []) {
        const v = ch?.value ?? {};
        for (const m of v.messages ?? []) {
          const phone = normalizePhone(m.from);
          if (!phone || !m.id) continue;
          const ts = Number(m.timestamp) * 1000 || this.now();
          const text: string =
            m.type === "text"
              ? (m.text?.body ?? "")
              : `[${m.type ?? "message"}]`;
          if (
            !this.store.addMessage({
              id: m.id,
              phone,
              direction: "in",
              body: text,
              ts,
            })
          ) {
            duplicates++;
            continue;
          }
          messages++;
          if (m.type === "text" && isStopKeyword(text, this.cfg.stopKeywords)) {
            const prev = this.store.getOptIn(phone);
            this.store.setOptIn({
              phone,
              optedIn: false,
              source: prev?.source ?? "inbound-stop",
              ts: prev?.ts ?? ts,
              revokedAt: ts,
            });
            optOuts++;
          }
        }
        for (const s of v.statuses ?? []) {
          const phone = normalizePhone(s.recipient_id);
          if (!phone || !s.id || !s.status) continue;
          const ts = Number(s.timestamp) * 1000 || this.now();
          if (
            this.store.addMessage({
              id: `${s.id}:${s.status}`,
              phone,
              direction: "status",
              body: s.status,
              ts,
              status: s.status,
            })
          )
            statuses++;
          else duplicates++;
        }
      }
    }
    return {
      ok: true as const,
      verified: true as const,
      messages,
      statuses,
      duplicates,
      optOuts,
    };
  }
}

/** Key-order-independent JSON for comparing the supplied payload with the signed body. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    return (
      "{" +
      Object.keys(v as object)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable((v as any)[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}
