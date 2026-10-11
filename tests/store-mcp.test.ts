import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/tools.js";
import {
  JsonFileStore,
  MemoryStore,
  SqliteStore,
  type Store,
} from "../src/store.js";
import {
  PHONE_NORM,
  T0,
  inboundPayload,
  makeService,
  signed,
} from "./helpers.js";

let hasSqlite = true;
try {
  await import("node:sqlite");
} catch {
  hasSqlite = false;
}

function contract(name: string, make: () => Store) {
  describe(`store contract: ${name}`, () => {
    it("opt-in round trip", () => {
      const s = make();
      expect(s.getOptIn("1")).toBeUndefined();
      s.setOptIn({ phone: "1", optedIn: true, source: "form", ts: 5 });
      expect(s.getOptIn("1")).toMatchObject({
        optedIn: true,
        source: "form",
        ts: 5,
      });
      s.setOptIn({
        phone: "1",
        optedIn: false,
        source: "form",
        ts: 5,
        revokedAt: 9,
      });
      expect(s.getOptIn("1")).toMatchObject({ optedIn: false, revokedAt: 9 });
    });
    it("messages: dedupe by id, ordering, limit, lastInbound, out counts", () => {
      const s = make();
      expect(
        s.addMessage({
          id: "a",
          phone: "1",
          direction: "in",
          body: "x",
          ts: 10,
        }),
      ).toBe(true);
      expect(
        s.addMessage({
          id: "a",
          phone: "1",
          direction: "in",
          body: "x",
          ts: 10,
        }),
      ).toBe(false);
      s.addMessage({ id: "b", phone: "1", direction: "in", body: "y", ts: 30 });
      s.addMessage({
        id: "c",
        phone: "1",
        direction: "out",
        body: "z",
        ts: 20,
      });
      s.addMessage({
        id: "d",
        phone: "2",
        direction: "in",
        body: "other",
        ts: 99,
      });
      expect(s.listMessages("1", 10).map((m) => m.id)).toEqual(["a", "c", "b"]);
      expect(s.listMessages("1", 2).map((m) => m.id)).toEqual(["c", "b"]);
      expect(s.lastInboundAt("1")).toBe(30);
      expect(s.lastInboundAt("3")).toBeUndefined();
      expect(s.countOutSince(10)).toBe(1);
      expect(s.countOutSince(20)).toBe(0);
      s.close();
    });
  });
}

contract("memory", () => new MemoryStore());
if (hasSqlite) {
  const { DatabaseSync } = await import("node:sqlite");
  contract("sqlite", () => new SqliteStore(new DatabaseSync(":memory:")));
}

describe("JsonFileStore persistence (Node 20 fallback)", () => {
  it("survives a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "wcm-"));
    try {
      const p = join(dir, "s.json");
      const a = new JsonFileStore(p);
      a.setOptIn({ phone: "1", optedIn: true, source: "form", ts: 1 });
      a.addMessage({ id: "m", phone: "1", direction: "in", body: "hi", ts: 2 });
      const b = new JsonFileStore(p);
      expect(b.getOptIn("1")?.optedIn).toBe(true);
      expect(b.listMessages("1", 5)).toHaveLength(1);
      expect(JSON.parse(readFileSync(p, "utf8")).msgs).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("starts empty on a corrupt file instead of crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wcm-"));
    try {
      const p = join(dir, "bad.json");
      (await import("node:fs")).writeFileSync(p, "{not json");
      expect(new JsonFileStore(p).listMessages("1", 5)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("MCP server over an in-memory transport", () => {
  async function connect() {
    const { svc, clock } = makeService({ dryRun: true });
    const server = buildServer(svc);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(ct);
    return { client, svc, clock };
  }
  const parse = (r: any) => JSON.parse(r.content[0].text);

  it("exposes exactly the 10 documented tools", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "check_window",
        "get_template",
        "ingest_webhook",
        "lint_template",
        "list_templates",
        "read_conversation",
        "record_optin",
        "revoke_optin",
        "send_template",
        "send_text",
      ].sort(),
    );
  });
  it("lint_template works with no credentials", async () => {
    const { client } = await connect();
    const r: any = await client.callTool({
      name: "lint_template",
      arguments: {
        body: "Hi {{1}}, enjoy a discount on your order today.",
        category: "UTILITY",
      },
    });
    expect(r.isError).toBe(false);
    expect(parse(r).reclassificationRisk).toBe("high");
  });
  it("a refusal comes back as isError with a clear reason", async () => {
    const { client } = await connect();
    const r: any = await client.callTool({
      name: "send_text",
      arguments: { to: "+628123456789", body: "hi" },
    });
    expect(r.isError).toBe(true);
    expect(parse(r)).toMatchObject({ refused: true, code: "no_opt_in" });
  });
  it("full flow: opt-in, inbound webhook, window open, dry-run text", async () => {
    const { client, clock } = await connect();
    await client.callTool({
      name: "record_optin",
      arguments: { to: PHONE_NORM, source: "web-form" },
    });
    const p = inboundPayload({
      id: "wamid.F1",
      tsSec: Math.floor((clock.now - 1000) / 1000),
    });
    const s = signed(p);
    const ing: any = await client.callTool({
      name: "ingest_webhook",
      arguments: { payload: p, signature: s.signature, rawBody: s.rawBody },
    });
    expect(parse(ing)).toMatchObject({ ok: true, messages: 1 });
    const w: any = await client.callTool({
      name: "check_window",
      arguments: { to: PHONE_NORM },
    });
    expect(parse(w).window.open).toBe(true);
    const t: any = await client.callTool({
      name: "send_text",
      arguments: { to: PHONE_NORM, body: "hello" },
    });
    expect(parse(t)).toMatchObject({ ok: true, dryRun: true });
    const c: any = await client.callTool({
      name: "read_conversation",
      arguments: { to: PHONE_NORM, limit: 5 },
    });
    expect(parse(c).count).toBe(1);
  });
  it("invalid webhook signature is an error result", async () => {
    const { client } = await connect();
    const s = signed(
      inboundPayload({ id: "wamid.F2", tsSec: Math.floor(T0 / 1000) }),
      "wrong",
    );
    const r: any = await client.callTool({
      name: "ingest_webhook",
      arguments: { signature: s.signature, rawBody: s.rawBody },
    });
    expect(r.isError).toBe(true);
    expect(parse(r).code).toBe("invalid_signature");
  });
});
