/** Normalise to E.164 digits without "+". Returns null if not plausible (7-15 digits). */
export function normalizePhone(input: string): string | null {
  const digits = String(input ?? "").replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

/** True if the inbound text is exactly one of the stop keywords (case-insensitive, trimmed, trailing punctuation ignored). */
export function isStopKeyword(text: string, keywords: string[]): boolean {
  const t = text
    .trim()
    .replace(/[.!\s]+$/g, "")
    .toUpperCase();
  return keywords.includes(t);
}
