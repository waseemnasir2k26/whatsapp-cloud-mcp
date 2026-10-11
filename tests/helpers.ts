import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig, type Config } from "../src/config.js";
import { computeSignature } from "../src/hmac.js";
import { WhatsAppService } from "../src/service.js";
import { MemoryStore } from "../src/store.js";

export const T0 = Date.UTC(2026, 9, 1, 12, 0, 0); // fixed "now"
export const HOUR = 3600 * 1000;
export const SECRET = "test-app-secret";
export const PHONE = "+62 812 3456 7890";
export const PHONE_NORM = "6281234567890";

export interface Recorded {
  method: string;
  url: string;
  auth?: string;
  body: any;
}

export interface MockGraph {
  baseUrl: string;
  requests: Recorded[];
  failNext: (status: number, body: unknown) => void;
  close: () => Promise<void>;
}

/** Local HTTP server that behaves like the bits of Graph API this project calls. */
export async function startMockGraph(): Promise<MockGraph> {
  const requests: Recorded[] = [];
  let fail: { status: number; body: unknown } | null = null;
  let n = 0;
  const server: Server = createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method ?? "",
      url: req.url ?? "",
      auth: req.headers.authorization,
      body: raw ? JSON.parse(raw) : undefined,
    });
    res.setHeader("content-type", "application/json");
    if (fail) {
      const f = fail;
      fail = null;
      res.statusCode = f.status;
      res.end(JSON.stringify(f.body));
      return;
    }
    if (req.method === "POST" && /\/messages$/.test(req.url ?? "")) {
      res.end(
        JSON.stringify({
          messaging_product: "whatsapp",
          contacts: [{ wa_id: PHONE_NORM }],
          messages: [{ id: `wamid.MOCK${++n}` }],
        }),
      );
      return;
    }
    if (req.method === "GET" && /\/message_templates/.test(req.url ?? "")) {
      const all = [
        {
          name: "order_shipped",
          status: "APPROVED",
          category: "UTILITY",
          language: "en_US",
          components: [
            { type: "BODY", text: "Hi {{1}}, order {{2}} shipped." },
          ],
        },
        {
          name: "welcome",
          status: "APPROVED",
          category: "MARKETING",
          language: "en_US",
          components: [],
        },
      ];
      const m = /[?&]name=([^&]+)/.exec(req.url ?? "");
      const data = m
        ? all.filter((t) => t.name === decodeURIComponent(m[1]))
        : all;
      res.end(JSON.stringify({ data }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { message: "not found" } }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    failNext: (status, body) => (fail = { status, body }),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export function makeConfig(over: Partial<Config> = {}): Config {
  return {
    ...loadConfig({}),
    token: "TEST_TOKEN",
    phoneNumberId: "111222333",
    wabaId: "999888777",
    appSecret: SECRET,
    dryRun: false,
    ...over,
  };
}

export function makeService(over: Partial<Config> = {}, clock = { now: T0 }) {
  const store = new MemoryStore();
  const svc = new WhatsAppService({
    config: makeConfig(over),
    store,
    now: () => clock.now,
  });
  return { svc, store, clock };
}

/** Build a Meta-style webhook delivery and sign it. */
export function signed(payload: unknown, secret = SECRET) {
  const rawBody = JSON.stringify(payload);
  return { rawBody, signature: computeSignature(rawBody, secret), payload };
}

export function inboundPayload(opts: {
  id: string;
  from?: string;
  text?: string;
  tsSec: number;
  type?: string;
}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550001111",
                phone_number_id: "111222333",
              },
              contacts: [
                {
                  profile: { name: "Test User" },
                  wa_id: opts.from ?? PHONE_NORM,
                },
              ],
              messages: [
                {
                  from: opts.from ?? PHONE_NORM,
                  id: opts.id,
                  timestamp: String(opts.tsSec),
                  type: opts.type ?? "text",
                  ...(opts.type && opts.type !== "text"
                    ? {}
                    : { text: { body: opts.text ?? "hello" } }),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function statusPayload(
  id: string,
  status: string,
  tsSec: number,
  to = PHONE_NORM,
) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550001111",
                phone_number_id: "111222333",
              },
              statuses: [
                { id, status, timestamp: String(tsSec), recipient_id: to },
              ],
            },
          },
        ],
      },
    ],
  };
}
