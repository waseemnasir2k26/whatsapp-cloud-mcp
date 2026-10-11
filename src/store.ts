import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type Direction = "in" | "out" | "status";

export interface MessageRow {
  id: string;
  phone: string;
  direction: Direction;
  body: string;
  ts: number; // epoch ms
  status?: string;
}

export interface OptInRow {
  phone: string;
  optedIn: boolean;
  source: string;
  ts: number;
  revokedAt?: number;
}

/** Small storage interface. Implementations: memory, JSON file, node:sqlite. */
export interface Store {
  readonly kind: string;
  setOptIn(row: OptInRow): void;
  getOptIn(phone: string): OptInRow | undefined;
  addMessage(m: MessageRow): boolean; // false if duplicate id
  lastInboundAt(phone: string): number | undefined;
  listMessages(phone: string, limit: number): MessageRow[];
  countOutSince(ts: number): number;
  close(): void;
}

export class MemoryStore implements Store {
  readonly kind: string = "memory";
  protected optins = new Map<string, OptInRow>();
  protected msgs: MessageRow[] = [];
  protected ids = new Set<string>();
  setOptIn(row: OptInRow) {
    this.optins.set(row.phone, { ...row });
    this.persist();
  }
  getOptIn(phone: string) {
    const r = this.optins.get(phone);
    return r ? { ...r } : undefined;
  }
  addMessage(m: MessageRow) {
    if (this.ids.has(m.id)) return false;
    this.ids.add(m.id);
    this.msgs.push({ ...m });
    this.persist();
    return true;
  }
  lastInboundAt(phone: string) {
    let best: number | undefined;
    for (const m of this.msgs) {
      if (
        m.phone === phone &&
        m.direction === "in" &&
        (best === undefined || m.ts > best)
      )
        best = m.ts;
    }
    return best;
  }
  listMessages(phone: string, limit: number) {
    return this.msgs
      .filter((m) => m.phone === phone)
      .sort((a, b) => a.ts - b.ts)
      .slice(-limit)
      .map((m) => ({ ...m }));
  }
  countOutSince(ts: number) {
    return this.msgs.filter((m) => m.direction === "out" && m.ts > ts).length;
  }
  close() {}
  protected persist() {}
}

/** Zero-dependency persistent fallback for runtimes without node:sqlite (Node 20). */
export class JsonFileStore extends MemoryStore {
  readonly kind: string = "json-file";
  constructor(private path: string) {
    super();
    if (existsSync(path)) {
      try {
        const d = JSON.parse(readFileSync(path, "utf8"));
        for (const o of d.optins ?? []) this.optins.set(o.phone, o);
        for (const m of d.msgs ?? []) {
          this.msgs.push(m);
          this.ids.add(m.id);
        }
      } catch {
        /* corrupt file: start empty rather than crash */
      }
    }
  }
  protected persist() {
    writeFileSync(
      this.path,
      JSON.stringify({ optins: [...this.optins.values()], msgs: this.msgs }),
    );
  }
}

export class SqliteStore implements Store {
  readonly kind = "sqlite";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private db: any) {
    db.exec(`CREATE TABLE IF NOT EXISTS optins (phone TEXT PRIMARY KEY, opted_in INTEGER, source TEXT, ts INTEGER, revoked_at INTEGER);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, phone TEXT, direction TEXT, body TEXT, ts INTEGER, status TEXT);
CREATE INDEX IF NOT EXISTS idx_messages_phone_ts ON messages(phone, ts);`);
  }
  setOptIn(r: OptInRow) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO optins (phone,opted_in,source,ts,revoked_at) VALUES (?,?,?,?,?)",
      )
      .run(r.phone, r.optedIn ? 1 : 0, r.source, r.ts, r.revokedAt ?? null);
  }
  getOptIn(phone: string) {
    const r = this.db.prepare("SELECT * FROM optins WHERE phone=?").get(phone);
    if (!r) return undefined;
    return {
      phone: r.phone,
      optedIn: !!r.opted_in,
      source: r.source,
      ts: Number(r.ts),
      revokedAt: r.revoked_at == null ? undefined : Number(r.revoked_at),
    } as OptInRow;
  }
  addMessage(m: MessageRow) {
    const res = this.db
      .prepare(
        "INSERT OR IGNORE INTO messages (id,phone,direction,body,ts,status) VALUES (?,?,?,?,?,?)",
      )
      .run(m.id, m.phone, m.direction, m.body, m.ts, m.status ?? null);
    return Number(res.changes) > 0;
  }
  lastInboundAt(phone: string) {
    const r = this.db
      .prepare(
        "SELECT MAX(ts) AS t FROM messages WHERE phone=? AND direction='in'",
      )
      .get(phone);
    return r?.t == null ? undefined : Number(r.t);
  }
  listMessages(phone: string, limit: number) {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE phone=? ORDER BY ts DESC LIMIT ?")
      .all(phone, limit);
    return rows.reverse().map((r: any) => ({
      id: r.id,
      phone: r.phone,
      direction: r.direction,
      body: r.body,
      ts: Number(r.ts),
      status: r.status ?? undefined,
    }));
  }
  countOutSince(ts: number) {
    const r = this.db
      .prepare(
        "SELECT COUNT(*) AS c FROM messages WHERE direction='out' AND ts>?",
      )
      .get(ts);
    return Number(r.c);
  }
  close() {
    this.db.close();
  }
}

/** Open the best available store: node:sqlite (Node >= 22.5) -> JSON file (Node 20). ":memory:" -> memory. */
export async function openStore(path: string): Promise<Store> {
  if (path === ":memory:") return new MemoryStore();
  try {
    const mod: any = await import("node:sqlite");
    return new SqliteStore(new mod.DatabaseSync(path));
  } catch {
    return new JsonFileStore(path.replace(/\.db$/, "") + ".json");
  }
}
