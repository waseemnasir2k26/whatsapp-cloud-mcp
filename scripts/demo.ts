// Runs the real service end to end in DRY_RUN with an in-memory store. No network, no credentials.
//   npm run demo
import { loadConfig } from "../src/config.js";
import { computeSignature } from "../src/hmac.js";
import { WhatsAppService } from "../src/service.js";
import { MemoryStore } from "../src/store.js";

const SECRET = "demo-app-secret";
const svc = new WhatsAppService({
  config: {
    ...loadConfig({ DRY_RUN: "true" }),
    appSecret: SECRET,
    token: "demo",
    phoneNumberId: "111222333",
    wabaId: "999",
  },
  store: new MemoryStore(),
});
const to = "+62 812 3456 7890";
const show = (title: string, v: unknown) =>
  console.log(`\n# ${title}\n${JSON.stringify(v, null, 2)}`);

const lint = svc.lintTemplate({
  category: "UTILITY",
  body: "Hi {{1}}, your order shipped! Use code SAVE20 for a discount, limited time only: bit.ly/x1",
});
show("lint_template (UTILITY draft)", {
  passed: lint.passed,
  reclassificationRisk: lint.reclassificationRisk,
  findings: lint.findings.map((f) => `${f.severity}: ${f.rule}`),
});

show("send_text before any opt-in", await svc.sendText(to, "Hi!"));

show("record_optin", svc.recordOptin(to, "checkout checkbox"));
show(
  "send_text, opted in but customer never wrote (no 24h window)",
  await svc.sendText(to, "Hi!"),
);

const inbound = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            messages: [
              {
                from: "6281234567890",
                id: "wamid.DEMO1",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Is my order on the way?" },
              },
            ],
          },
        },
      ],
    },
  ],
};
const raw = JSON.stringify(inbound);
show(
  "ingest_webhook with a forged signature",
  svc.ingestWebhook(inbound, computeSignature(raw, "wrong"), raw),
);
show(
  "ingest_webhook with the real signature",
  svc.ingestWebhook(inbound, computeSignature(raw, SECRET), raw),
);

const w: any = svc.checkWindow(to);
show("check_window", {
  open: w.window.open,
  expiresAt: w.window.expiresAt,
  canSendFreeText: w.canSendFreeText,
});
show(
  "send_text inside the window (DRY_RUN)",
  await svc.sendText(to, "Yes, it arrives tomorrow."),
);

const stop = {
  ...inbound,
  entry: [
    {
      ...inbound.entry[0],
      changes: [
        {
          field: "messages",
          value: {
            messages: [
              {
                from: "6281234567890",
                id: "wamid.DEMO2",
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "STOP" },
              },
            ],
          },
        },
      ],
    },
  ],
};
const stopRaw = JSON.stringify(stop);
show(
  "customer replies STOP",
  svc.ingestWebhook(stop, computeSignature(stopRaw, SECRET), stopRaw),
);
show("send_text after STOP", await svc.sendText(to, "One more thing..."));
