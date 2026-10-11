# WhatsApp Cloud API MCP Server (official, compliant, with guardrails)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![MCP](https://img.shields.io/badge/MCP-stdio-purple)

**An MCP server that lets Claude (or any MCP client) send WhatsApp messages through Meta's official Business Cloud API, and refuses to do anything that would put your number at risk.**

> The 6.5k-star [WhatsApp MCP](https://github.com/lharries/whatsapp-mcp) uses a personal-account bridge (the WhatsApp Web multi-device protocol) that can get a number banned. This one uses Meta's official Cloud API with guardrails.

It is **ToS-safe for businesses by construction**: official Graph API only, never WhatsApp Web, never scraping. It also enforces the rules Meta enforces on you: the 24-hour customer-service window, recorded opt-in, template approval, and STOP handling. (You remain responsible for your own consent collection and for Meta's Business and Commerce policies. This tool makes the safe path the default, it does not replace your obligations.)

## 60-second quickstart

1. In Meta's developer dashboard create an app with the WhatsApp product. Note your **phone number ID**, **WABA ID**, **app secret**, and a permanent **system-user token**.
2. Add the server to Claude Desktop (see [`claude_desktop_config.example.json`](claude_desktop_config.example.json)):

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "npx",
      "args": ["-y", "whatsapp-cloud-mcp"],
      "env": {
        "WHATSAPP_TOKEN": "<token>",
        "WHATSAPP_PHONE_NUMBER_ID": "<phone number id>",
        "WHATSAPP_WABA_ID": "<waba id>",
        "WHATSAPP_APP_SECRET": "<app secret>",
        "DRY_RUN": "true"
      }
    }
  }
}
```

3. Ask Claude: _"Lint this template for me"_ (works with no credentials at all), then _"record opt-in for +62..., then send the order_shipped template"_.
4. `DRY_RUN` is **on by default**: every send returns the exact payload it _would_ send. Set `DRY_RUN=false` only when you are ready to go live.

> `npx whatsapp-cloud-mcp` works once the package is published to npm. Until then: `git clone`, `npm ci && npm run build`, and point `command` at `node` with `args` `["/path/to/whatsapp-cloud-mcp/dist/server.js"]`.

## Tools (10)

| Tool                                                         | What it does                                                                                | Guards                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `send_template(to, name, lang, params)`                      | Send an approved template (business-initiated)                                              | opt-in required, caps, `DRY_RUN`                                      |
| `send_text(to, body)`                                        | Free-form text                                                                              | **Refused** outside the 24h window or without opt-in, caps, `DRY_RUN` |
| `check_window(to)`                                           | Is the 24h window open? when does it expire? opted in?                                      | read-only                                                             |
| `list_templates()`                                           | Templates on your WABA (name, status, category, language)                                   | needs token + WABA id                                                 |
| `get_template(name)`                                         | One template, all languages                                                                 | needs token + WABA id                                                 |
| `lint_template(body, category, header?, buttons?, samples?)` | Offline linter, 34 rules, reclassification-risk flag                                        | no network, no credentials                                            |
| `record_optin(to, source, ts)`                               | Record consent (with source)                                                                | your audit trail                                                      |
| `revoke_optin(to)`                                           | Revoke consent; all sends refused                                                           |                                                                       |
| `read_conversation(to, limit)`                               | Local history: inbound, outbound, delivery statuses                                         | local store                                                           |
| `ingest_webhook(payload, signature, rawBody)`                | Verify `X-Hub-Signature-256` HMAC, store messages and statuses, open the window, honor STOP | unverified payloads ignored                                           |

## Guardrails

| Guard                | Behavior                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRY_RUN`            | Default `true`. Returns the would-send Graph payload and URL, makes no HTTP call, consumes no cap. Only the literal values `false`, `0`, `no` turn it off.             |
| 24h window           | Opens on a _verified_ inbound message, closes at exactly 24h after the customer's latest one. `send_text` is refused outside it and tells the agent to use a template. |
| Opt-in               | Required for both `send_text` and `send_template` (`REQUIRE_OPTIN=false` disables, not recommended). Inbound messages do not count as opt-in.                          |
| STOP / UNSUBSCRIBE   | An inbound message that is exactly one of `STOP_KEYWORDS` (default `STOP,UNSUBSCRIBE`, case-insensitive) auto-revokes opt-in. "please don't stop" does not.            |
| Caps                 | `DAILY_SEND_CAP` (default 200, rolling 24h) and `MINUTE_RATE_CAP` (default 20, rolling 60s), counted over real sends.                                                  |
| Webhook verification | HMAC-SHA256 over the **raw** body, constant-time compare. If you also pass a parsed `payload`, it must equal the signed body. Duplicate deliveries are ignored.        |
| Clear refusals       | Every refusal returns `{ refused: true, code, reason }` and an MCP `isError`, so the agent can explain it to the user.                                                 |

## Template rejected? Lint it first

Meta rejects or silently **re-categorises** templates (UTILITY becomes MARKETING, with different pricing and opt-in expectations). `lint_template` runs 34 offline checks, including wording in English, Spanish, Portuguese, Arabic and Indonesian:

- Promotional words, discount codes and urgency inside a **UTILITY** template (the classic reclassification trigger)
- URL shorteners (body and buttons), `wa.me` links
- Adjacent variables `{{1}}{{2}}`, leading/trailing variables, variable-to-text ratio, numbering gaps, malformed placeholders
- Body over 1024 chars, header over 60, button text over 25, more than 3 quick replies, button-count limits
- Missing or invalid sample values, AUTHENTICATION templates with links or no code variable, missing opt-out hint on MARKETING, shouting caps, emoji and `!!!`

Real output (from `npm run demo`):

```text
# lint_template (UTILITY draft)
{
  "passed": false,
  "reclassificationRisk": "high",
  "findings": [
    "error: url-shortener",
    "warn: missing-samples",
    "error: utility-promo-words",
    "error: utility-discount-code",
    "error: utility-urgency"
  ]
}
```

These are heuristics built from Meta's published template guidelines. Meta's review is the final word, and the rules can drift; treat a clean lint as "very likely fine", not a guarantee.

## Demo: what a refusal looks like

Also real output from `npm run demo` (no network, no credentials):

```text
# send_text before any opt-in
{ "ok": false, "refused": true, "code": "no_opt_in",
  "reason": "No opt-in on record for 6281234567890. Call record_optin first (with the real consent source)." }

# send_text, opted in but customer never wrote (no 24h window)
{ "ok": false, "refused": true, "code": "window_closed",
  "reason": "6281234567890 has never messaged this number, so there is no open 24h window. Send an approved template instead." }

# ingest_webhook with a forged signature
{ "ok": false, "refused": true, "code": "invalid_signature",
  "reason": "X-Hub-Signature-256 does not match the raw body. Payload ignored." }

# send_text inside the window (DRY_RUN)
{ "ok": true, "dryRun": true,
  "wouldSend": { "method": "POST", "url": "https://graph.facebook.com/v21.0/111222333/messages",
    "payload": { "messaging_product": "whatsapp", "to": "6281234567890", "type": "text",
      "text": { "preview_url": false, "body": "Yes, it arrives tomorrow." } } } }

# customer replies STOP, then:
{ "ok": false, "refused": true, "code": "opted_out",
  "reason": "6281234567890 revoked opt-in at 2026-10-11T23:50:04.000Z. Not sending." }
```

## Webhooks: how inbound messages get in

The 24h window can only be known if the server sees inbound messages. Point Meta's webhook at your own endpoint, **verify**, then hand the delivery to `ingest_webhook` (or use the library API directly):

- [`examples/express-webhook.ts`](examples/express-webhook.ts): Express receiver using `express.raw` and `verifySignature`
- [`examples/n8n-code-node-verify.js`](examples/n8n-code-node-verify.js): drop-in HMAC verification for an n8n Webhook node with **Raw Body** on (executed by the test suite)

## Configuration

| Env var                              | Default                                | Meaning                                                           |
| ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------- |
| `WHATSAPP_TOKEN`                     |                                        | Graph API access token (needed for live sends and template reads) |
| `WHATSAPP_PHONE_NUMBER_ID`           |                                        | Sender phone number ID                                            |
| `WHATSAPP_WABA_ID`                   |                                        | WhatsApp Business Account ID (template reads)                     |
| `WHATSAPP_APP_SECRET`                |                                        | Verifies webhooks. Without it `ingest_webhook` refuses everything |
| `DRY_RUN`                            | `true`                                 | `false` to really send                                            |
| `DAILY_SEND_CAP` / `MINUTE_RATE_CAP` | `200` / `20`                           | Send caps                                                         |
| `STOP_KEYWORDS`                      | `STOP,UNSUBSCRIBE`                     | Comma list that auto-revokes opt-in                               |
| `REQUIRE_OPTIN`                      | `true`                                 | Require recorded opt-in                                           |
| `WHATSAPP_MCP_DB`                    | `./whatsapp-mcp.db`                    | Local store. `:memory:` for ephemeral                             |
| `GRAPH_BASE_URL` / `GRAPH_VERSION`   | `https://graph.facebook.com` / `v21.0` | Override for testing                                              |

**Storage:** SQLite via Node's built-in `node:sqlite` (Node 22.5+). On Node 20 it automatically falls back to a JSON file next to the db path. Both pass the same contract tests. Data stays on your machine.

## Tested

`npm test` runs the vitest suite: 159 tests against a local mock Graph API server (window open, closed and expired at exactly 24h, opt-in missing, dry-run, daily and per-minute caps, Graph errors), HMAC valid, invalid and tampered cases with a published test vector, webhook fixtures for messages and statuses, 70+ linter cases (EN/ES/PT/AR/ID), the store contracts, an MCP client talking to the server over an in-memory transport, and the n8n code-node example. A GitHub Actions workflow for Ubuntu, macOS and Windows on Node 20 and 22 is provided in [`docs/ci-workflow.yml`](docs/ci-workflow.yml). Copy it to `.github/workflows/ci.yml` to enable it. It has not yet run on GitHub: the token used for the initial push could not create workflow files, and the suite was run locally on Windows (Node 24).

What is **not** tested: real calls to Meta (no credentials in CI). The request shapes follow Meta's documented Cloud API; verify against your own sandbox number before going live.

## FAQ

**Is this against WhatsApp's Terms?** It uses the official WhatsApp Business Cloud API, which is the supported way for businesses to automate WhatsApp. Compliance still depends on you collecting real consent and using approved templates.

**Why can't it send free text to a new customer?** Because Meta does not allow it: outside the 24-hour window you may only send approved templates.

**Does it read my personal WhatsApp?** No. It only knows what Meta's webhook delivers to your business number.

**Can the agent bypass the guards?** Not through the tools. Guards run in the server, not the prompt. Whoever controls the server's environment controls `DRY_RUN` and the caps, so keep your token and config out of the agent's reach.

**Media, interactive messages, flows?** Not in v1.0. Text and template sends only.

## More from SkynetLabs

- [n8n-whatsapp-compliant-agent](https://github.com/waseemnasir2k26/n8n-whatsapp-compliant-agent): the n8n-side WhatsApp agent that stays inside Meta's rules (this MCP is the Claude-side counterpart)
- [upwork-mcp-toolkit](https://github.com/waseemnasir2k26/upwork-mcp-toolkit): offline Upwork MCP helpers (job scoring, Connects ROI, proposal lint)
- [mcp-spend-guard](https://github.com/waseemnasir2k26/mcp-spend-guard): wrap any MCP server with spend caps and a kill switch
- [fiverr-gig-optimizer](https://github.com/waseemnasir2k26/fiverr-gig-optimizer): free offline Fiverr gig scorer

## Work with SkynetLabs

Built by [Waseem Nasir](https://www.skynetjoe.com/?utm_source=github&utm_medium=readme&utm_campaign=whatsapp-cloud-mcp) at SkynetLabs — n8n + AI automation for small businesses.

We wire Claude/n8n agents into your WhatsApp Business number safely.

- Hire on Fiverr: https://www.fiverr.com/agencies/skynetjoellc
- Hire on Upwork: https://www.upwork.com/freelancers/muhammadwaseemnasir
- Book a free call: https://calendly.com/skynetlabs/schedule-a-free-consultation

## License

MIT, see [LICENSE](LICENSE). Not affiliated with or endorsed by Meta or WhatsApp.
