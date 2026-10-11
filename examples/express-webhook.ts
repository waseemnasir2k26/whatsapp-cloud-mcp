// Minimal Express receiver for Meta's WhatsApp webhooks.
//   npm i express whatsapp-cloud-mcp && npm i -D @types/express tsx
//   WHATSAPP_APP_SECRET=... WHATSAPP_VERIFY_TOKEN=... npx tsx examples/express-webhook.ts
//
// Not part of the npm build (excluded from tsc) and not exercised by CI; the verification
// primitive it uses (verifySignature) is covered by tests/hmac.test.ts.
import express from "express";
import { verifySignature } from "whatsapp-cloud-mcp";

const app = express();
const SECRET = process.env.WHATSAPP_APP_SECRET ?? "";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

// One-time subscription handshake (Meta calls this when you save the webhook URL).
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    res.status(200).send(String(req.query["hub.challenge"]));
  } else {
    res.sendStatus(403);
  }
});

// IMPORTANT: express.raw, not express.json. The HMAC is over the exact bytes Meta sent.
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const raw = req.body as Buffer;
  if (!verifySignature(raw, req.header("x-hub-signature-256"), SECRET)) {
    res.sendStatus(401);
    return;
  }
  const payload = JSON.parse(raw.toString("utf8"));
  console.log("verified webhook:", JSON.stringify(payload).slice(0, 200));
  // Hand `payload` + the signature + raw body to the MCP tool `ingest_webhook`, or store it yourself.
  res.sendStatus(200);
});

app.listen(3000, () => console.log("listening on :3000"));
