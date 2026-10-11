import { createHmac, timingSafeEqual } from "node:crypto";

/** Compute the `sha256=<hex>` value Meta sends in X-Hub-Signature-256. */
export function computeSignature(
  rawBody: string | Buffer,
  appSecret: string,
): string {
  return (
    "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex")
  );
}

/**
 * Verify X-Hub-Signature-256 over the RAW request body (never over re-serialised JSON).
 * Constant-time comparison. Returns false for missing/malformed headers.
 */
export function verifySignature(
  rawBody: string | Buffer,
  header: string | undefined | null,
  appSecret: string,
): boolean {
  if (!appSecret || !header || typeof header !== "string") return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim());
  if (!m) return false;
  const expected = Buffer.from(
    computeSignature(rawBody, appSecret).slice(7),
    "hex",
  );
  const given = Buffer.from(m[1], "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
