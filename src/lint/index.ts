import {
  RULES,
  normalizeText,
  type Ctx,
  type Finding,
  type TemplateInput,
} from "./rules.js";

export type { TemplateInput, Finding, Button, Category } from "./rules.js";
export { RULES } from "./rules.js";

export interface LintResult {
  passed: boolean;
  category: string;
  summary: { errors: number; warnings: number; infos: number };
  reclassificationRisk: "none" | "medium" | "high";
  reclassificationReasons: string[];
  findings: Finding[];
  rulesChecked: number;
}

const MEDIUM_SIGNALS = new Set([
  "excessive-emoji",
  "excessive-caps",
  "excessive-punctuation",
  "wa-me-link",
  "variable-ratio",
]);

/** Offline template linter. Heuristics based on Meta's published template guidelines; Meta's review is the final word. */
export function lintTemplate(input: TemplateInput): LintResult {
  const body = input.body ?? "";
  const rawTokens = [...body.matchAll(/\{\{[^{}]*\}\}/g)].map((m) => ({
    raw: m[0],
    inner: m[0].slice(2, -2).trim(),
  }));
  const ctx: Ctx = {
    ...input,
    body,
    category: String(input.category ?? "").toUpperCase() as Ctx["category"],
    norm: normalizeText(body),
    tokens: rawTokens,
    nums: rawTokens
      .filter((t) => /^[1-9]\d*$/.test(t.inner))
      .map((t) => Number(t.inner)),
    textOnly: body.replace(/\{\{[^{}]*\}\}/g, " "),
  };
  const findings = RULES.flatMap((r) => r.check(ctx));
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  const infos = findings.filter((f) => f.severity === "info").length;

  const reclassReasons = findings
    .filter((f) => f.reclass)
    .map((f) => f.message);
  let risk: LintResult["reclassificationRisk"] = "none";
  if (reclassReasons.length) risk = "high";
  else if (
    ctx.category === "UTILITY" &&
    findings.some((f) => MEDIUM_SIGNALS.has(f.rule))
  ) {
    risk = "medium";
    reclassReasons.push(
      "Marketing-style signals in a UTILITY template: " +
        findings
          .filter((f) => MEDIUM_SIGNALS.has(f.rule))
          .map((f) => f.rule)
          .join(", "),
    );
  }
  return {
    passed: errors === 0,
    category: ctx.category,
    summary: { errors, warnings, infos },
    reclassificationRisk: risk,
    reclassificationReasons: reclassReasons,
    findings,
    rulesChecked: RULES.length,
  };
}
