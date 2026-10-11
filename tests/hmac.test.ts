import { describe, expect, it } from "vitest";
import { computeSignature, verifySignature } from "../src/hmac.js";

// Published HMAC-SHA256 test vector (Wikipedia): key="key", msg="The quick brown fox jumps over the lazy dog"
const KEY = "key";
const MSG = "The quick brown fox jumps over the lazy dog";
const HEX = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

describe("HMAC X-Hub-Signature-256", () => {
  it("matches the known HMAC-SHA256 vector", () => {
    expect(computeSignature(MSG, KEY)).toBe("sha256=" + HEX);
  });
  it("accepts a valid signature", () => {
    expect(verifySignature(MSG, "sha256=" + HEX, KEY)).toBe(true);
  });
  it("accepts upper-case hex", () => {
    expect(verifySignature(MSG, "sha256=" + HEX.toUpperCase(), KEY)).toBe(true);
  });
  it("accepts a Buffer body", () => {
    expect(verifySignature(Buffer.from(MSG), "sha256=" + HEX, KEY)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifySignature(MSG + "!", "sha256=" + HEX, KEY)).toBe(false);
  });
  it("rejects a re-serialised (whitespace-changed) JSON body", () => {
    const raw = '{"a":1,"b":2}';
    const sig = computeSignature(raw, KEY);
    expect(verifySignature('{"a": 1, "b": 2}', sig, KEY)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifySignature(MSG, "sha256=" + HEX, "other")).toBe(false);
  });
  it("rejects a flipped signature character", () => {
    const bad = "sha256=" + (HEX[0] === "f" ? "0" : "f") + HEX.slice(1);
    expect(verifySignature(MSG, bad, KEY)).toBe(false);
  });
  it("rejects missing, empty and malformed headers", () => {
    expect(verifySignature(MSG, undefined, KEY)).toBe(false);
    expect(verifySignature(MSG, "", KEY)).toBe(false);
    expect(verifySignature(MSG, HEX, KEY)).toBe(false); // no sha256= prefix
    expect(verifySignature(MSG, "sha1=" + HEX, KEY)).toBe(false);
    expect(verifySignature(MSG, "sha256=abc", KEY)).toBe(false);
  });
  it("rejects when the app secret is empty", () => {
    expect(verifySignature(MSG, computeSignature(MSG, ""), "")).toBe(false);
  });
});
