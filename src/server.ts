#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { WhatsAppService } from "./service.js";
import { openStore } from "./store.js";
import { buildServer } from "./tools.js";

async function main() {
  const config = loadConfig();
  const store = await openStore(config.dbPath);
  const svc = new WhatsAppService({ config, store });
  const server = buildServer(svc);
  // stdout is the MCP channel: log only to stderr.
  console.error(
    `whatsapp-cloud-mcp ready | store=${store.kind} | DRY_RUN=${config.dryRun} | caps=${config.dailySendCap}/day ${config.minuteRateCap}/min`,
  );
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
