import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { computeSignature } from "../src/hmac.js";

// Executes examples/n8n-code-node-verify.js the way an n8n Code node would (with $input / $env injected).
const code = readFileSync(
  new URL("../examples/n8n-code-node-verify.js", import.meta.url),
  "utf8",
);
const run = new Function("$input", "$env", "require", code) as (
  i: any,
  e: any,
  r: any,
) => any[];
const req = createRequire(import.meta.url);

const SECRET = "n8n-secret";
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "1" }],
});

function item(
  raw: string,
  sig: string | undefined,
  secretHeader = "x-hub-signature-256",
) {
  return {
    first: () => ({
      json: { headers: sig === undefined ? {} : { [secretHeader]: sig } },
      binary: { data: { data: Buffer.from(raw).toString("base64") } },
    }),
  };
}

describe("examples/n8n-code-node-verify.js", () => {
  it("verifies a valid signature and returns the parsed payload", () => {
    const out = run(
      item(body, computeSignature(body, SECRET)),
      { WHATSAPP_APP_SECRET: SECRET },
      req,
    );
    expect(out[0].json.verified).toBe(true);
    expect(out[0].json.payload.entry[0].id).toBe("1");
  });
  it("rejects a tampered body", () => {
    const out = run(
      item(body.replace("1", "2"), computeSignature(body, SECRET)),
      { WHATSAPP_APP_SECRET: SECRET },
      req,
    );
    expect(out[0].json).toMatchObject({
      verified: false,
      reason: "signature mismatch",
    });
  });
  it("rejects a wrong secret", () => {
    const out = run(
      item(body, computeSignature(body, "nope")),
      { WHATSAPP_APP_SECRET: SECRET },
      req,
    );
    expect(out[0].json.verified).toBe(false);
  });
  it("rejects a missing header", () => {
    const out = run(
      item(body, undefined),
      { WHATSAPP_APP_SECRET: SECRET },
      req,
    );
    expect(out[0].json.reason).toMatch(/missing/);
  });
  it("reports when the secret is not configured", () => {
    const out = run(item(body, computeSignature(body, SECRET)), {}, req);
    expect(out[0].json.reason).toMatch(/not set/);
  });
  it("reports when Raw Body is off", () => {
    const i = {
      first: () => ({
        json: { headers: { "x-hub-signature-256": "sha256=00" } },
      }),
    };
    expect(run(i, { WHATSAPP_APP_SECRET: SECRET }, req)[0].json.reason).toMatch(
      /Raw Body/,
    );
  });
});
