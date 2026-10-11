import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WhatsAppService } from "./service.js";

const reply = (r: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(r, null, 2) }],
  isError: !!(r && typeof r === "object" && (r as any).ok === false),
});

export function buildServer(
  svc: WhatsAppService,
  version = "1.0.0",
): McpServer {
  const server = new McpServer({ name: "whatsapp-cloud-mcp", version });
  const phone = z
    .string()
    .describe("Recipient phone in international format, e.g. +6281234567890");

  server.registerTool(
    "send_template",
    {
      description:
        "Send an approved WhatsApp template (business-initiated). Requires recorded opt-in. Honors DRY_RUN (default true), daily and per-minute caps.",
      inputSchema: {
        to: phone,
        name: z.string().describe("Approved template name"),
        lang: z
          .string()
          .describe("Template language code, e.g. en_US, es, pt_BR, ar, id"),
        params: z
          .array(z.string())
          .optional()
          .describe("Body variable values in order ({{1}}, {{2}}...)"),
      },
    },
    async ({ to, name, lang, params }) =>
      reply(await svc.sendTemplate(to, name, lang, params ?? [])),
  );

  server.registerTool(
    "send_text",
    {
      description:
        "Send free-form text. REFUSED unless the customer messaged you in the last 24h (open service window) AND has a recorded opt-in. Otherwise use send_template.",
      inputSchema: {
        to: phone,
        body: z.string().describe("Message text (max 4096 chars)"),
      },
    },
    async ({ to, body }) => reply(await svc.sendText(to, body)),
  );

  server.registerTool(
    "check_window",
    {
      description:
        "Report whether the 24h customer-service window is open for a number, when it expires, and opt-in status.",
      inputSchema: { to: phone },
    },
    async ({ to }) => reply(svc.checkWindow(to)),
  );

  server.registerTool(
    "list_templates",
    {
      description:
        "List message templates on the WhatsApp Business Account (name, status, category, language, components).",
      inputSchema: {},
    },
    async () => reply(await svc.listTemplates()),
  );

  server.registerTool(
    "get_template",
    {
      description: "Get one message template by exact name (all languages).",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => reply(await svc.getTemplate(name)),
  );

  server.registerTool(
    "lint_template",
    {
      description:
        "Offline template linter (no network, no credentials): checks a draft against Meta's template rules and flags UTILITY to MARKETING reclassification risk. Works for EN/ES/PT/AR/ID wording.",
      inputSchema: {
        body: z.string(),
        category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
        header: z.string().optional(),
        buttons: z
          .array(
            z.object({
              type: z.string().describe("QUICK_REPLY | URL | PHONE_NUMBER"),
              text: z.string(),
              url: z.string().optional(),
            }),
          )
          .optional(),
        samples: z
          .array(z.string())
          .optional()
          .describe("Sample value for each {{n}} variable"),
      },
    },
    async (a) => reply(svc.lintTemplate(a as any)),
  );

  server.registerTool(
    "record_optin",
    {
      description:
        "Record that a user opted in to WhatsApp messages. Be honest in `source`: it is your consent audit trail.",
      inputSchema: {
        to: phone,
        source: z
          .string()
          .describe(
            "How consent was captured, e.g. 'checkout checkbox', 'web-form 2026-10-01'",
          ),
        ts: z
          .string()
          .optional()
          .describe("ISO timestamp of consent (defaults to now)"),
      },
    },
    async ({ to, source, ts }) => reply(svc.recordOptin(to, source, ts)),
  );

  server.registerTool(
    "revoke_optin",
    {
      description:
        "Revoke a user's opt-in. All further sends to that number are refused.",
      inputSchema: { to: phone },
    },
    async ({ to }) => reply(svc.revokeOptin(to)),
  );

  server.registerTool(
    "read_conversation",
    {
      description:
        "Read the locally stored conversation (inbound messages from verified webhooks, outbound sends, delivery statuses).",
      inputSchema: {
        to: phone,
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ to, limit }) => reply(svc.readConversation(to, limit ?? 20)),
  );

  server.registerTool(
    "ingest_webhook",
    {
      description:
        "Verify a Meta webhook delivery (X-Hub-Signature-256 HMAC over the RAW body) and store messages/status updates. Inbound messages open the 24h window; STOP/UNSUBSCRIBE revokes opt-in. Unverified payloads are ignored.",
      inputSchema: {
        payload: z
          .record(z.string(), z.any())
          .optional()
          .describe("Parsed JSON body (optional; must equal rawBody)"),
        signature: z
          .string()
          .describe("Value of the X-Hub-Signature-256 header"),
        rawBody: z.string().describe("The exact request body string Meta sent"),
      },
    },
    async ({ payload, signature, rawBody }) =>
      reply(svc.ingestWebhook(payload, signature, rawBody)),
  );

  return server;
}
