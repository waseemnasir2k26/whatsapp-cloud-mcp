import { describe, expect, it } from "vitest";
import { WINDOW_MS, windowState } from "../src/window.js";
import {
  HOUR,
  PHONE,
  PHONE_NORM,
  T0,
  inboundPayload,
  makeService,
  signed,
} from "./helpers.js";

describe("windowState", () => {
  it("is closed when the customer never wrote", () => {
    const w = windowState(undefined, T0);
    expect(w.open).toBe(false);
    expect(w.expiresAt).toBeNull();
  });
  it("is open 1 minute after an inbound message", () => {
    expect(windowState(T0 - 60_000, T0).open).toBe(true);
  });
  it("is open at 23h59m", () => {
    expect(windowState(T0 - (24 * HOUR - 60_000), T0).open).toBe(true);
  });
  it("is CLOSED at exactly 24h", () => {
    expect(windowState(T0 - WINDOW_MS, T0).open).toBe(false);
  });
  it("is closed after 24h and reports 0 ms remaining", () => {
    const w = windowState(T0 - 30 * HOUR, T0);
    expect(w.open).toBe(false);
    expect(w.msRemaining).toBe(0);
  });
  it("reports the expiry timestamp", () => {
    expect(windowState(T0, T0).expiresAt).toBe(
      new Date(T0 + WINDOW_MS).toISOString(),
    );
  });
});

describe("check_window via service", () => {
  it("opens when a verified inbound message arrives and expires at 24h", () => {
    const { svc, clock } = makeService();
    const p = inboundPayload({ id: "wamid.A", tsSec: Math.floor(T0 / 1000) });
    const s = signed(p);
    expect(svc.ingestWebhook(p, s.signature, s.rawBody)).toMatchObject({
      ok: true,
      messages: 1,
    });
    expect((svc.checkWindow(PHONE) as any).window.open).toBe(true);
    clock.now = T0 + 23 * HOUR;
    expect((svc.checkWindow(PHONE) as any).window.open).toBe(true);
    clock.now = T0 + 24 * HOUR;
    expect((svc.checkWindow(PHONE) as any).window.open).toBe(false);
  });
  it("is closed for an unknown number", () => {
    const { svc } = makeService();
    const r: any = svc.checkWindow("+15551230000");
    expect(r.window.open).toBe(false);
    expect(r.optedIn).toBe(false);
    expect(r.canSendFreeText).toBe(false);
  });
  it("rejects an invalid phone number", () => {
    const { svc } = makeService();
    expect(svc.checkWindow("abc")).toMatchObject({
      refused: true,
      code: "bad_phone",
    });
  });
  it("a newer inbound message extends the window", () => {
    const { svc, clock } = makeService();
    for (const [id, off] of [
      ["wamid.1", -20 * HOUR],
      ["wamid.2", -1 * HOUR],
    ] as const) {
      const p = inboundPayload({ id, tsSec: Math.floor((T0 + off) / 1000) });
      const s = signed(p);
      svc.ingestWebhook(p, s.signature, s.rawBody);
    }
    clock.now = T0 + 10 * HOUR; // 11h after the 2nd message, 30h after the 1st
    expect((svc.checkWindow(PHONE_NORM) as any).window.open).toBe(true);
  });
});
