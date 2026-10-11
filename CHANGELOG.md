# Changelog

## 1.0.0 - 2026-10-12

Initial release.

- 10 MCP tools over stdio: `send_template`, `send_text`, `check_window`, `list_templates`, `get_template`, `lint_template`, `record_optin`, `revoke_optin`, `read_conversation`, `ingest_webhook`.
- Official WhatsApp Business Cloud (Graph) API only.
- Guards: `DRY_RUN` on by default, 24h-window and opt-in enforcement, daily and per-minute send caps, STOP/UNSUBSCRIBE auto-revoke, webhook HMAC verification over the raw body.
- Offline template linter with 34 rules and a UTILITY-to-MARKETING reclassification-risk flag (EN/ES/PT/AR/ID wording).
- Storage: `node:sqlite` (Node 22.5+) with an automatic JSON-file fallback on Node 20; in-memory store for tests.
- Examples: Express webhook receiver, n8n Code-node HMAC verification, Claude Desktop config.
- vitest suite against a local mock Graph server; CI workflow for Ubuntu, macOS and Windows in `docs/ci-workflow.yml`.
