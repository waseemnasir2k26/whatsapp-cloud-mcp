export interface Config {
  token: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  graphBaseUrl: string;
  graphVersion: string;
  dryRun: boolean;
  dailySendCap: number;
  minuteRateCap: number;
  dbPath: string;
  stopKeywords: string[];
  requireOptIn: boolean;
}

function num(v: string | undefined, d: number): number {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
}

/** DRY_RUN is ON unless explicitly set to "false" (or "0" / "no"). */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): Config {
  const dry = (env.DRY_RUN ?? "true").trim().toLowerCase();
  return {
    token: env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    wabaId: env.WHATSAPP_WABA_ID ?? "",
    appSecret: env.WHATSAPP_APP_SECRET ?? "",
    graphBaseUrl: (env.GRAPH_BASE_URL ?? "https://graph.facebook.com").replace(
      /\/+$/,
      "",
    ),
    graphVersion: env.GRAPH_VERSION ?? "v21.0",
    dryRun: !(dry === "false" || dry === "0" || dry === "no"),
    dailySendCap: num(env.DAILY_SEND_CAP, 200),
    minuteRateCap: num(env.MINUTE_RATE_CAP, 20),
    dbPath: env.WHATSAPP_MCP_DB ?? "./whatsapp-mcp.db",
    stopKeywords: (env.STOP_KEYWORDS ?? "STOP,UNSUBSCRIBE")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
    requireOptIn: (env.REQUIRE_OPTIN ?? "true").toLowerCase() !== "false",
  };
}
