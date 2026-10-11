import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  HOUR,
  PHONE,
  PHONE_NORM,
  T0,
  makeService,
  startMockGraph,
  type MockGraph,
  inboundPayload,
  signed,
} from "./helpers.js";

let mock: MockGraph;
beforeAll(async () => {
  mock = await startMockGraph();
});
afterAll(async () => {
  await mock.close();
});
beforeEach(() => {
  mock.requests.length = 0;
});

const live = (over = {}) =>
  makeService({ graphBaseUrl: mock.baseUrl, ...over });

function openWindow(svc: any, clock: { now: number }, ageMs = HOUR) {
  const p = inboundPayload({
    id: "wamid.IN" + Math.random(),
    tsSec: Math.floor((clock.now - ageMs) / 1000),
  });
  const s = signed(p);
  svc.ingestWebhook(p, s.signature, s.rawBody);
}

describe("config defaults", () => {
  it("DRY_RUN is true by default and only false when explicitly disabled", () => {
    expect(loadConfig({}).dryRun).toBe(true);
    expect(loadConfig({ DRY_RUN: "true" }).dryRun).toBe(true);
    expect(loadConfig({ DRY_RUN: "banana" }).dryRun).toBe(true);
    expect(loadConfig({ DRY_RUN: "false" }).dryRun).toBe(false);
  });
  it("has sane caps by default", () => {
    const c = loadConfig({});
    expect(c.dailySendCap).toBe(200);
    expect(c.minuteRateCap).toBe(20);
    expect(c.stopKeywords).toEqual(["STOP", "UNSUBSCRIBE"]);
  });
});

describe("send_template guards", () => {
  it("refuses without opt-in", async () => {
    const { svc } = live();
    expect(
      await svc.sendTemplate(PHONE, "order_shipped", "en_US", ["A", "B"]),
    ).toMatchObject({ refused: true, code: "no_opt_in" });
    expect(mock.requests).toHaveLength(0);
  });
  it("refuses an invalid number", async () => {
    const { svc } = live();
    expect(await svc.sendTemplate("12", "x", "en_US")).toMatchObject({
      refused: true,
      code: "bad_phone",
    });
  });
  it("refuses after opt-out", async () => {
    const { svc } = live();
    svc.recordOptin(PHONE, "web-form");
    svc.revokeOptin(PHONE);
    expect(await svc.sendTemplate(PHONE, "x", "en_US")).toMatchObject({
      refused: true,
      code: "opted_out",
    });
  });
  it("DRY_RUN returns the would-send payload and makes no HTTP call", async () => {
    const { svc } = live({ dryRun: true });
    svc.recordOptin(PHONE, "web-form");
    const r: any = await svc.sendTemplate(PHONE, "order_shipped", "en_US", [
      "Ana",
      "#42",
    ]);
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.wouldSend.payload.template.name).toBe("order_shipped");
    expect(r.wouldSend.payload.template.components[0].parameters).toEqual([
      { type: "text", text: "Ana" },
      { type: "text", text: "#42" },
    ]);
    expect(r.wouldSend.payload.to).toBe(PHONE_NORM);
    expect(mock.requests).toHaveLength(0);
  });
  it("sends for real to the (mock) Graph API with a bearer token", async () => {
    const { svc, store } = live();
    svc.recordOptin(PHONE, "web-form");
    const r: any = await svc.sendTemplate(PHONE, "order_shipped", "en_US", [
      "Ana",
      "#42",
    ]);
    expect(r).toMatchObject({ ok: true, dryRun: false });
    expect(r.messageId).toMatch(/^wamid\.MOCK/);
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].url).toBe("/v21.0/111222333/messages");
    expect(mock.requests[0].auth).toBe("Bearer TEST_TOKEN");
    expect(mock.requests[0].body.type).toBe("template");
    expect(store.listMessages(PHONE_NORM, 5)[0].direction).toBe("out");
  });
  it("surfaces Graph API errors without throwing", async () => {
    const { svc } = live();
    svc.recordOptin(PHONE, "web-form");
    mock.failNext(400, {
      error: { message: "Template name does not exist", code: 132001 },
    });
    const r: any = await svc.sendTemplate(PHONE, "nope", "en_US");
    expect(r).toMatchObject({
      ok: false,
      code: "graph_error",
      status: 400,
      reason: "Template name does not exist",
    });
  });
  it("refuses live sends with missing credentials", async () => {
    const { svc } = live({ token: "" });
    svc.recordOptin(PHONE, "web-form");
    expect(await svc.sendTemplate(PHONE, "x", "en_US")).toMatchObject({
      refused: true,
      code: "missing_credentials",
    });
  });
});

describe("send_text guards", () => {
  it("refused when no window (customer never wrote), even with opt-in", async () => {
    const { svc } = live();
    svc.recordOptin(PHONE, "web-form");
    const r: any = await svc.sendText(PHONE, "hi");
    expect(r).toMatchObject({ refused: true, code: "window_closed" });
    expect(r.reason).toMatch(/template/);
    expect(mock.requests).toHaveLength(0);
  });
  it("refused when window is open but opt-in is missing", async () => {
    const { svc, clock } = live();
    openWindow(svc, clock);
    expect(await svc.sendText(PHONE, "hi")).toMatchObject({
      refused: true,
      code: "no_opt_in",
    });
  });
  it("allowed inside the window with opt-in", async () => {
    const { svc, clock } = live();
    svc.recordOptin(PHONE, "web-form");
    openWindow(svc, clock, 2 * HOUR);
    const r: any = await svc.sendText(PHONE, "Your table is ready");
    expect(r).toMatchObject({ ok: true, dryRun: false });
    expect(mock.requests[0].body.text.body).toBe("Your table is ready");
  });
  it("refused once the window has expired at 24h", async () => {
    const { svc, clock } = live();
    svc.recordOptin(PHONE, "web-form");
    openWindow(svc, clock, 24 * HOUR);
    expect(await svc.sendText(PHONE, "late")).toMatchObject({
      refused: true,
      code: "window_closed",
    });
  });
  it("still allowed at 23h59m", async () => {
    const { svc, clock } = live();
    svc.recordOptin(PHONE, "web-form");
    openWindow(svc, clock, 24 * HOUR - 60_000);
    expect(await svc.sendText(PHONE, "just in time")).toMatchObject({
      ok: true,
    });
  });
  it("DRY_RUN inside the window returns payload, no HTTP", async () => {
    const { svc, clock } = live({ dryRun: true });
    svc.recordOptin(PHONE, "web-form");
    openWindow(svc, clock);
    const r: any = await svc.sendText(PHONE, "hello");
    expect(r.dryRun).toBe(true);
    expect(r.wouldSend.payload.text.body).toBe("hello");
    expect(mock.requests).toHaveLength(0);
  });
  it("rejects empty bodies", async () => {
    const { svc } = live();
    expect(await svc.sendText(PHONE, "   ")).toMatchObject({
      refused: true,
      code: "bad_input",
    });
  });
});

describe("caps", () => {
  it("enforces the daily cap and counts only real sends", async () => {
    const { svc } = live({ dailySendCap: 2, minuteRateCap: 100 });
    svc.recordOptin(PHONE, "web-form");
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      ok: true,
    });
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      ok: true,
    });
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      refused: true,
      code: "daily_cap",
    });
    expect(mock.requests).toHaveLength(2);
  });
  it("daily cap resets after 24h", async () => {
    const { svc, clock } = live({ dailySendCap: 1, minuteRateCap: 100 });
    svc.recordOptin(PHONE, "web-form");
    await svc.sendTemplate(PHONE, "a", "en_US");
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      code: "daily_cap",
    });
    clock.now += 24 * HOUR + 1000;
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      ok: true,
    });
  });
  it("enforces the per-minute rate cap and recovers after a minute", async () => {
    const { svc, clock } = live({ dailySendCap: 100, minuteRateCap: 2 });
    svc.recordOptin(PHONE, "web-form");
    await svc.sendTemplate(PHONE, "a", "en_US");
    await svc.sendTemplate(PHONE, "a", "en_US");
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      refused: true,
      code: "rate_cap",
    });
    clock.now += 61_000;
    expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
      ok: true,
    });
  });
  it("dry runs do not consume the cap", async () => {
    const { svc } = live({ dryRun: true, dailySendCap: 1 });
    svc.recordOptin(PHONE, "web-form");
    for (let i = 0; i < 5; i++)
      expect(await svc.sendTemplate(PHONE, "a", "en_US")).toMatchObject({
        ok: true,
        dryRun: true,
      });
  });
});

describe("opt-in records", () => {
  it("record_optin stores source and ISO timestamp", () => {
    const { svc, store } = live();
    const r: any = svc.recordOptin(
      PHONE,
      "checkout checkbox",
      "2026-09-30T10:00:00Z",
    );
    expect(r.ts).toBe("2026-09-30T10:00:00.000Z");
    expect(store.getOptIn(PHONE_NORM)).toMatchObject({
      optedIn: true,
      source: "checkout checkbox",
    });
  });
  it("record_optin requires a source and a valid ts", () => {
    const { svc } = live();
    expect(svc.recordOptin(PHONE, " ")).toMatchObject({ refused: true });
    expect(svc.recordOptin(PHONE, "x", "not-a-date")).toMatchObject({
      refused: true,
    });
  });
  it("revoke then re-record restores opt-in", async () => {
    const { svc } = live({ dryRun: true });
    svc.recordOptin(PHONE, "a");
    svc.revokeOptin(PHONE);
    expect(await svc.sendTemplate(PHONE, "t", "en")).toMatchObject({
      code: "opted_out",
    });
    svc.recordOptin(PHONE, "re-consent");
    expect(await svc.sendTemplate(PHONE, "t", "en")).toMatchObject({
      ok: true,
    });
  });
});

describe("templates via Graph", () => {
  it("list_templates and get_template call the WABA endpoint", async () => {
    const { svc } = live();
    const l: any = await svc.listTemplates();
    expect(l.templates).toHaveLength(2);
    expect(mock.requests[0].url).toContain(
      "/v21.0/999888777/message_templates",
    );
    const g: any = await svc.getTemplate("order_shipped");
    expect(g.templates[0].name).toBe("order_shipped");
    expect(await svc.getTemplate("missing")).toMatchObject({
      refused: true,
      code: "not_found",
    });
  });
  it("needs WABA id and token", async () => {
    const { svc } = live({ wabaId: "" });
    expect(await svc.listTemplates()).toMatchObject({
      refused: true,
      code: "missing_credentials",
    });
  });
});

describe("read_conversation", () => {
  it("returns inbound, outbound and statuses in time order, honoring limit", async () => {
    const { svc, clock } = live();
    svc.recordOptin(PHONE, "form");
    openWindow(svc, clock, 2 * HOUR);
    await svc.sendText(PHONE, "reply");
    const all: any = svc.readConversation(PHONE, 10);
    expect(all.messages.map((m: any) => m.direction)).toEqual(["in", "out"]);
    expect((svc.readConversation(PHONE, 1) as any).messages).toHaveLength(1);
  });
});

void T0;
