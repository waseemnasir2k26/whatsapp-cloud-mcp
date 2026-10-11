// n8n "Code" node (Run Once for All Items), placed right after a Webhook node.
//
// Webhook node setup:
//   - HTTP Method: POST, Path: whatsapp
//   - Options -> Raw Body: ON   (REQUIRED: the signature is computed over the exact bytes Meta sent)
// n8n setup:
//   - Environment variable WHATSAPP_APP_SECRET = your Meta App Secret
//   - Allow the builtin module:  NODE_FUNCTION_ALLOW_BUILTIN=crypto
//   - Keep binary data in "default" (in-memory) mode so item.binary.data.data holds base64.
//     (With filesystem/S3 binary mode, read the file via this.helpers.getBinaryDataBuffer instead.)
//
// Output: one item with { verified: boolean, reason?: string, payload?: object }.
// Route on `verified` with an IF node; only the `true` branch should touch your CRM / agent.

const crypto = require("crypto");

const item = $input.first();
const secret = $env.WHATSAPP_APP_SECRET;
const header = (item.json.headers || {})["x-hub-signature-256"];

function fail(reason) {
  return [{ json: { verified: false, reason } }];
}

if (!secret) return fail("WHATSAPP_APP_SECRET is not set");
if (!item.binary || !item.binary.data)
  return fail("Raw Body option is off: no binary.data on the Webhook item");
if (!header) return fail("missing X-Hub-Signature-256 header");

const raw = Buffer.from(item.binary.data.data, "base64");
const expected =
  "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

const a = Buffer.from(expected);
const b = Buffer.from(String(header));
const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

if (!ok) return fail("signature mismatch");

return [
  { json: { verified: true, payload: JSON.parse(raw.toString("utf8")) } },
];
