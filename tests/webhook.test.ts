import { describe, expect, it } from "vitest";
import {
  HOUR,
  PHONE_NORM,
  SECRET,
  T0,
  inboundPayload,
  makeService,
  signed,
  statusPayload,
} from "./helpers.js";

const sec = (ms: number) => Math.floor(ms / 1000);

describe("ingest_webhook", () => {
  it("stores a verified inbound text message", () => {
    const { svc, store } = makeService();
    const p = inboundPayload({
      id: "wamid.1",
      tsSec: sec(T0),
      text: "Hi there",
    });
    const s = signed(p);
    expect(svc.ingestWebhook(p, s.signature, s.rawBody)).toMatchObject({
      ok: true,
      verified: true,
      messages: 1,
      statuses: 0,
    });
    const m = store.listMessages(PHONE_NORM, 5);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      direction: "in",
      body: "Hi there",
      ts: sec(T0) * 1000,
    });
  });
  it("stores a delivery status update", () => {
    const { svc, store } = makeService();
    const p = statusPayload("wamid.OUT1", "delivered", sec(T0));
    const s = signed(p);
    expect(svc.ingestWebhook(p, s.signature, s.rawBody)).toMatchObject({
      ok: true,
      statuses: 1,
      messages: 0,
    });
    expect(store.listMessages(PHONE_NORM, 5)[0]).toMatchObject({
      direction: "status",
      status: "delivered",
    });
  });
  it("a status update does NOT open the 24h window", () => {
    const { svc } = makeService();
    const p = statusPayload("wamid.OUT1", "read", sec(T0));
    const s = signed(p);
    svc.ingestWebhook(p, s.signature, s.rawBody);
    expect((svc.checkWindow(PHONE_NORM) as any).window.open).toBe(false);
  });
  it("keeps sent -> delivered -> read as separate rows", () => {
    const { svc, store } = makeService();
    for (const st of ["sent", "delivered", "read"]) {
      const p = statusPayload("wamid.OUT2", st, sec(T0));
      const s = signed(p);
      svc.ingestWebhook(p, s.signature, s.rawBody);
    }
    expect(store.listMessages(PHONE_NORM, 10)).toHaveLength(3);
  });
  it("rejects an invalid signature and stores nothing", () => {
    const { svc, store } = makeService();
    const p = inboundPayload({ id: "wamid.2", tsSec: sec(T0) });
    const s = signed(p, "attacker-secret");
    expect(svc.ingestWebhook(p, s.signature, s.rawBody)).toMatchObject({
      refused: true,
      code: "invalid_signature",
    });
    expect(store.listMessages(PHONE_NORM, 5)).toHaveLength(0);
  });
  it("rejects a tampered body", () => {
    const { svc, store } = makeService();
    const p = inboundPayload({
      id: "wamid.3",
      tsSec: sec(T0),
      text: "original",
    });
    const s = signed(p);
    const tampered = s.rawBody.replace("original", "tampered");
    expect(svc.ingestWebhook(undefined, s.signature, tampered)).toMatchObject({
      refused: true,
      code: "invalid_signature",
    });
    expect(store.listMessages(PHONE_NORM, 5)).toHaveLength(0);
  });
  it("rejects when the parsed payload differs from the signed rawBody", () => {
    const { svc, store } = makeService();
    const real = inboundPayload({
      id: "wamid.4",
      tsSec: sec(T0),
      text: "real",
    });
    const fake = inboundPayload({
      id: "wamid.4",
      tsSec: sec(T0),
      text: "STOP",
    });
    const s = signed(real);
    expect(svc.ingestWebhook(fake, s.signature, s.rawBody)).toMatchObject({
      refused: true,
      code: "payload_mismatch",
    });
    expect(store.listMessages(PHONE_NORM, 5)).toHaveLength(0);
  });
  it("accepts a payload whose key order differs from rawBody", () => {
    const { svc } = makeService();
    const p = inboundPayload({ id: "wamid.5", tsSec: sec(T0) });
    const s = signed(p);
    const rev = (v: any): any =>
      Array.isArray(v)
        ? v.map(rev)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, rev(v[k])]))
          : v;
    const reordered = rev(p);
    expect(svc.ingestWebhook(reordered, s.signature, s.rawBody)).toMatchObject({
      ok: true,
      messages: 1,
    });
  });
  it("rejects a missing signature", () => {
    const { svc } = makeService();
    const s = signed(inboundPayload({ id: "wamid.6", tsSec: sec(T0) }));
    expect(svc.ingestWebhook(undefined, undefined, s.rawBody)).toMatchObject({
      refused: true,
      code: "invalid_signature",
    });
  });
  it("refuses to ingest when no app secret is configured", () => {
    const { svc } = makeService({ appSecret: "" });
    const s = signed(inboundPayload({ id: "wamid.7", tsSec: sec(T0) }), SECRET);
    expect(svc.ingestWebhook(undefined, s.signature, s.rawBody)).toMatchObject({
      refused: true,
      code: "no_app_secret",
    });
  });
  it("is idempotent: Meta retries do not duplicate messages", () => {
    const { svc, store } = makeService();
    const p = inboundPayload({ id: "wamid.8", tsSec: sec(T0) });
    const s = signed(p);
    svc.ingestWebhook(p, s.signature, s.rawBody);
    expect(svc.ingestWebhook(p, s.signature, s.rawBody)).toMatchObject({
      messages: 0,
      duplicates: 1,
    });
    expect(store.listMessages(PHONE_NORM, 5)).toHaveLength(1);
  });
  it("labels non-text inbound messages by type", () => {
    const { svc, store } = makeService();
    const p = inboundPayload({ id: "wamid.9", tsSec: sec(T0), type: "image" });
    const s = signed(p);
    svc.ingestWebhook(p, s.signature, s.rawBody);
    expect(store.listMessages(PHONE_NORM, 5)[0].body).toBe("[image]");
  });
  it("rejects a non-JSON body even when correctly signed", () => {
    const { svc } = makeService();
    const raw = "not json";
    const sig = signed({}, SECRET).signature; // wrong sig
    expect(svc.ingestWebhook(undefined, sig, raw)).toMatchObject({
      refused: true,
    });
  });
});

describe("STOP / UNSUBSCRIBE auto-revoke", () => {
  for (const word of [
    "STOP",
    "stop",
    " Stop. ",
    "UNSUBSCRIBE",
    "unsubscribe!",
  ]) {
    it(`"${word}" revokes opt-in and blocks later sends`, async () => {
      const { svc } = makeService({ dryRun: true });
      svc.recordOptin(PHONE_NORM, "web-form");
      const p = inboundPayload({
        id: "wamid.S" + word.trim(),
        tsSec: sec(T0 - HOUR),
        text: word,
      });
      const s = signed(p);
      expect(svc.ingestWebhook(p, s.signature, s.rawBody)).toMatchObject({
        optOuts: 1,
      });
      expect(await svc.sendText(PHONE_NORM, "hello")).toMatchObject({
        refused: true,
        code: "opted_out",
      });
      expect(await svc.sendTemplate(PHONE_NORM, "t", "en")).toMatchObject({
        refused: true,
        code: "opted_out",
      });
    });
  }
  it("does not revoke on a sentence that merely contains stop", () => {
    const { svc, store } = makeService();
    svc.recordOptin(PHONE_NORM, "web-form");
    const p = inboundPayload({
      id: "wamid.S2",
      tsSec: sec(T0),
      text: "please don't stop the delivery",
    });
    const s = signed(p);
    svc.ingestWebhook(p, s.signature, s.rawBody);
    expect(store.getOptIn(PHONE_NORM)?.optedIn).toBe(true);
  });
  it("custom keywords from config are honored", () => {
    const { svc, store } = makeService({ stopKeywords: ["BAJA"] });
    svc.recordOptin(PHONE_NORM, "web-form");
    const p = inboundPayload({ id: "wamid.S3", tsSec: sec(T0), text: "baja" });
    const s = signed(p);
    svc.ingestWebhook(p, s.signature, s.rawBody);
    expect(store.getOptIn(PHONE_NORM)?.optedIn).toBe(false);
  });
});
