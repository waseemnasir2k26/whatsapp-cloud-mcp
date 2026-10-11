export type Severity = "error" | "warn" | "info";
export type Category = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export interface Button {
  type: string; // QUICK_REPLY | URL | PHONE_NUMBER | COPY_CODE ...
  text: string;
  url?: string;
}

export interface TemplateInput {
  body: string;
  category: Category;
  header?: string;
  buttons?: Button[];
  samples?: string[];
}

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  /** true when this finding is a reason Meta may re-categorise a UTILITY template as MARKETING */
  reclass?: boolean;
}

export interface Ctx extends TemplateInput {
  /** body with accents stripped (NFD, marks removed) and Arabic alef variants folded, case preserved */
  norm: string;
  /** all `{{...}}` tokens found in body */
  tokens: { raw: string; inner: string }[];
  /** numeric placeholders found in body (in order of appearance) */
  nums: number[];
  /** body with every `{{...}}` removed */
  textOnly: string;
}

export interface Rule {
  id: string;
  describe: string;
  check: (c: Ctx) => Finding[];
}

export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[أإآ]/g, "ا");
}

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";

/** Unicode-aware whole-word matcher (JS \b is ASCII-only and breaks on Arabic/accents). */
export function words(list: string[]): RegExp {
  const AR_PREFIX = "(?:\\u0627\\u0644|[\\u0648\\u0628\\u0644\\u0641\\u0643])?"; // al-, wa-, bi-, li-, fa-, ka-
  const alt = list
    .map((w) => {
      const n = normalizeText(w)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/ /g, "\\s+");
      return /^[\u0600-\u06FF]/.test(n) ? AR_PREFIX + n : n;
    })
    .join("|");
  return new RegExp(`${B}(?:${alt})${E}`, "giu");
}

export const PROMO = words([
  // EN
  "sale",
  "sales",
  "discount",
  "discounts",
  "offer",
  "offers",
  "deal",
  "deals",
  "free",
  "promo",
  "promotion",
  "promotional",
  "coupon",
  "coupons",
  "voucher",
  "cashback",
  "bonus",
  "exclusive",
  "buy now",
  "special price",
  // ES
  "oferta",
  "ofertas",
  "descuento",
  "descuentos",
  "gratis",
  "gratuito",
  "promocion",
  "promociones",
  "cupon",
  "rebaja",
  "rebajas",
  "ahorra",
  "ahorro",
  // PT
  "desconto",
  "descontos",
  "promocao",
  "promocoes",
  "cupom",
  "economize",
  "brinde",
  "gratuita",
  // AR
  "خصم",
  "خصومات",
  "عرض",
  "عروض",
  "مجاني",
  "مجانا",
  "مجانية",
  "تخفيض",
  "تخفيضات",
  "كوبون",
  "برومو",
  "هدية",
  // ID
  "diskon",
  "penawaran",
  "potongan",
  "hemat",
  "kupon",
  "promosi",
]);

export const PERCENT_OFF =
  /(?:\d+\s*%\s*(?:off|de\s+desc\w+|de\s+desconto|diskon)|(?:off|diskon|desc\w+|desconto)\s*\d+\s*%|%\s*off)/giu;

export const URGENCY = words([
  // EN
  "limited time",
  "limited offer",
  "limited stock",
  "hurry",
  "act now",
  "last chance",
  "expires soon",
  "today only",
  "don't miss",
  "dont miss",
  "ends soon",
  "while supplies last",
  "only today",
  "final hours",
  "running out",
  // ES
  "tiempo limitado",
  "oferta limitada",
  "ultima oportunidad",
  "ultimas horas",
  "no te pierdas",
  "solo hoy",
  "date prisa",
  "aprovecha ya",
  "hasta agotar existencias",
  // PT
  "tempo limitado",
  "ultima chance",
  "so hoje",
  "corra",
  "nao perca",
  "aproveite ja",
  "ate acabar o estoque",
  // AR
  "لفترة محدودة",
  "عرض محدود",
  "فرصة اخيرة",
  "لا تفوت",
  "اليوم فقط",
  "سارع",
  "الكمية محدودة",
  // ID
  "waktu terbatas",
  "stok terbatas",
  "terbatas",
  "jangan lewatkan",
  "hari ini saja",
  "kesempatan terakhir",
  "buruan",
]);

/** Words that, shortly before an upper-case token, make it look like a promo / discount code. */
export const CODE_PREFIX = words([
  "use",
  "usa",
  "usar",
  "utiliza",
  "utilice",
  "utilize",
  "gunakan",
  "code",
  "codigo",
  "cupom",
  "cupon",
  "kupon",
  "kode",
  "coupon",
  "promo",
  "voucher",
  "الكود",
  "كود",
  "كوبون",
]);
/** Upper-case token (4+ chars, at least one letter) such as SAVE20 or VERANO25. */
export const CODE_TOKEN =
  /(?<![\p{L}\p{N}])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{4,}(?![\p{L}\p{N}])/gu;

export const SHORTENERS =
  /(?<![\p{L}\p{N}.-])(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|lnkd\.in|t\.ly|rb\.gy|wa\.link)(?=[\/\s?#]|$)/giu;
export const WAME =
  /(?<![\p{L}\p{N}.-])wa\.me(?=[\/\s?#]|$)|api\.whatsapp\.com\/send/giu;
export const URL_RE = /(?:https?:\/\/|www\.)[^\s]+/giu;

export const OPT_OUT = words([
  "stop",
  "unsubscribe",
  "opt out",
  "opt-out",
  "baja",
  "darse de baja",
  "parar",
  "cancelar suscripcion",
  "sair",
  "descadastrar",
  "berhenti",
  "berhenti berlangganan",
  "الغاء الاشتراك",
  "توقف",
  "ايقاف",
]);

const has = (re: RegExp, s: string) => {
  re.lastIndex = 0;
  return re.test(s);
};
const all = (re: RegExp, s: string): string[] => {
  re.lastIndex = 0;
  return [...s.matchAll(re)].map((m) => m[0]);
};

const MAX_BODY = 1024;
const MAX_HEADER = 60;
const MAX_BTN = 25;
const VAR_RE = /\{\{[^{}]*\}\}/g;
const len = (s: string) => [...s].length;

function f(
  rule: string,
  severity: Severity,
  message: string,
  reclass?: boolean,
): Finding[] {
  return [{ rule, severity, message, ...(reclass ? { reclass } : {}) }];
}

export const RULES: Rule[] = [
  {
    id: "invalid-category",
    describe: "Category must be UTILITY, MARKETING or AUTHENTICATION.",
    check: (c) =>
      ["UTILITY", "MARKETING", "AUTHENTICATION"].includes(c.category)
        ? []
        : f("invalid-category", "error", `Unknown category "${c.category}".`),
  },
  {
    id: "body-empty",
    describe: "Body text is required.",
    check: (c) =>
      c.body.trim() ? [] : f("body-empty", "error", "Body is empty."),
  },
  {
    id: "body-too-long",
    describe: "Body max 1024 characters.",
    check: (c) =>
      len(c.body) > MAX_BODY
        ? f(
            "body-too-long",
            "error",
            `Body is ${len(c.body)} chars (max ${MAX_BODY}).`,
          )
        : [],
  },
  {
    id: "header-too-long",
    describe: "Header max 60 characters.",
    check: (c) =>
      c.header && len(c.header) > MAX_HEADER
        ? f(
            "header-too-long",
            "error",
            `Header is ${len(c.header)} chars (max ${MAX_HEADER}).`,
          )
        : [],
  },
  {
    id: "header-multiple-vars",
    describe: "Header supports at most one variable.",
    check: (c) =>
      c.header && (c.header.match(VAR_RE) ?? []).length > 1
        ? f(
            "header-multiple-vars",
            "error",
            "Header has more than one variable.",
          )
        : [],
  },
  {
    id: "header-formatting",
    describe:
      "Header must not contain line breaks, emoji or markdown-style formatting characters.",
    check: (c) =>
      c.header && /[\n\r]|[*_~`]|\p{Extended_Pictographic}/u.test(c.header)
        ? f(
            "header-formatting",
            "error",
            "Header contains a line break, emoji or formatting character (* _ ~).",
          )
        : [],
  },
  {
    id: "button-text-empty",
    describe: "Every button needs text.",
    check: (c) =>
      (c.buttons ?? []).some((b) => !b.text?.trim())
        ? f("button-text-empty", "error", "A button has empty text.")
        : [],
  },
  {
    id: "button-text-too-long",
    describe: "Button text max 25 characters.",
    check: (c) =>
      (c.buttons ?? [])
        .filter((b) => len(b.text ?? "") > MAX_BTN)
        .flatMap((b) =>
          f(
            "button-text-too-long",
            "error",
            `Button "${b.text}" is ${len(b.text)} chars (max ${MAX_BTN}).`,
          ),
        ),
  },
  {
    id: "too-many-quick-replies",
    describe: "More than 3 quick-reply buttons is flagged.",
    check: (c) =>
      (c.buttons ?? []).filter((b) => b.type === "QUICK_REPLY").length > 3
        ? f(
            "too-many-quick-replies",
            "warn",
            "More than 3 quick-reply buttons; they collapse into a list and hurt reply rate.",
          )
        : [],
  },
  {
    id: "too-many-buttons",
    describe: "Max 10 buttons in total.",
    check: (c) =>
      (c.buttons ?? []).length > 10
        ? f(
            "too-many-buttons",
            "error",
            `${(c.buttons ?? []).length} buttons (max 10).`,
          )
        : [],
  },
  {
    id: "too-many-url-buttons",
    describe: "Max 2 URL buttons.",
    check: (c) =>
      (c.buttons ?? []).filter((b) => b.type === "URL").length > 2
        ? f("too-many-url-buttons", "error", "More than 2 URL buttons (max 2).")
        : [],
  },
  {
    id: "too-many-phone-buttons",
    describe: "Max 1 phone-number button.",
    check: (c) =>
      (c.buttons ?? []).filter((b) => b.type === "PHONE_NUMBER").length > 1
        ? f(
            "too-many-phone-buttons",
            "error",
            "More than 1 phone-number button (max 1).",
          )
        : [],
  },
  {
    id: "url-shortener",
    describe: "URL shorteners are rejected.",
    check: (c) => {
      const hits = all(SHORTENERS, c.norm);
      return hits.length
        ? f(
            "url-shortener",
            "error",
            `URL shortener in body (${hits[0]}). Use your full domain.`,
          )
        : [];
    },
  },
  {
    id: "button-url-shortener",
    describe: "URL shorteners in button URLs are rejected.",
    check: (c) =>
      (c.buttons ?? []).some((b) => b.url && has(SHORTENERS, b.url))
        ? f(
            "button-url-shortener",
            "error",
            "A button URL uses a URL shortener.",
          )
        : [],
  },
  {
    id: "wa-me-link",
    describe:
      "wa.me / api.whatsapp.com/send links in a template are frequently flagged.",
    check: (c) =>
      has(WAME, c.norm) ||
      (c.buttons ?? []).some((b) => b.url && has(WAME, b.url))
        ? f(
            "wa-me-link",
            "warn",
            "wa.me link found; use a quick-reply or phone-number button instead.",
          )
        : [],
  },
  {
    id: "insecure-url",
    describe: "Prefer https.",
    check: (c) =>
      /http:\/\//i.test(c.body) ||
      (c.buttons ?? []).some((b) => /^http:\/\//i.test(b.url ?? ""))
        ? f("insecure-url", "warn", "http:// link found; use https://.")
        : [],
  },
  {
    id: "adjacent-variables",
    describe: "Variables must not be adjacent ({{1}}{{2}}).",
    check: (c) =>
      /\}\}\{\{/.test(c.body)
        ? f(
            "adjacent-variables",
            "error",
            "Adjacent variables {{n}}{{m}}; separate them with text.",
          )
        : [],
  },
  {
    id: "leading-variable",
    describe: "Body must not start with a variable.",
    check: (c) =>
      c.body.trimStart().startsWith("{{")
        ? f(
            "leading-variable",
            "error",
            "Body starts with a variable; add text before it.",
          )
        : [],
  },
  {
    id: "trailing-variable",
    describe: "Body must not end with a variable.",
    check: (c) =>
      c.body.trimEnd().endsWith("}}")
        ? f(
            "trailing-variable",
            "error",
            "Body ends with a variable; add text after it.",
          )
        : [],
  },
  {
    id: "variable-ratio",
    describe: "Too many variables relative to fixed text.",
    check: (c) => {
      if (!c.tokens.length) return [];
      const n = c.textOnly
        .split(/\s+/)
        .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      return n / c.tokens.length < 3
        ? f(
            "variable-ratio",
            "warn",
            `Only ${n} fixed word(s) for ${c.tokens.length} variable(s); aim for 3+ words per variable.`,
          )
        : [];
    },
  },
  {
    id: "placeholder-gaps",
    describe: "Placeholders must be numbered 1..n without gaps.",
    check: (c) => {
      const uniq = [...new Set(c.nums)].sort((a, b) => a - b);
      return uniq.every((n, i) => n === i + 1)
        ? []
        : f(
            "placeholder-gaps",
            "error",
            `Placeholders must run {{1}}..{{n}} with no gaps (found ${uniq.map((n) => `{{${n}}}`).join(", ")}).`,
          );
    },
  },
  {
    id: "malformed-placeholder",
    describe:
      "Placeholders must look like {{1}} (no names, spaces or unbalanced braces).",
    check: (c) => {
      const bad = c.tokens.filter((t) => !/^\{\{[1-9]\d*\}\}$/.test(t.raw));
      if (bad.length)
        return f(
          "malformed-placeholder",
          "error",
          `Malformed placeholder ${bad[0].raw}; use {{1}}, {{2}}...`,
        );
      if (/\{\{|\}\}/.test(c.textOnly))
        return f(
          "malformed-placeholder",
          "error",
          "Unbalanced {{ or }} in body.",
        );
      return [];
    },
  },
  {
    id: "missing-samples",
    describe: "Meta needs a sample value for each variable at submission.",
    check: (c) => {
      const n = new Set(c.nums).size;
      const got = (c.samples ?? []).length;
      return n > 0 && got < n
        ? f(
            "missing-samples",
            "warn",
            `${n} variable(s) but ${got} sample value(s) provided; Meta rejects templates without samples.`,
          )
        : [];
    },
  },
  {
    id: "sample-invalid",
    describe:
      "Sample values must be non-empty and free of line breaks, tabs and 4+ spaces.",
    check: (c) =>
      (c.samples ?? []).some((s) => !s.trim() || /[\n\r\t]|\s{4,}/.test(s))
        ? f(
            "sample-invalid",
            "error",
            "A sample value is empty or contains a line break, tab or 4+ consecutive spaces.",
          )
        : [],
  },
  {
    id: "utility-promo-words",
    describe: "Promotional wording in a UTILITY template.",
    check: (c) => {
      if (c.category !== "UTILITY") return [];
      const hits = [
        ...new Set(
          [...all(PROMO, c.norm), ...all(PERCENT_OFF, c.norm)].map((s) =>
            s.toLowerCase(),
          ),
        ),
      ];
      return hits.length
        ? f(
            "utility-promo-words",
            "error",
            `Promotional wording (${hits.slice(0, 3).join(", ")}) in a UTILITY template; Meta re-categorises these as MARKETING.`,
            true,
          )
        : [];
    },
  },
  {
    id: "utility-discount-code",
    describe: "Discount / promo code in a UTILITY template.",
    check: (c) => {
      if (c.category !== "UTILITY") return [];
      const hit = [...c.norm.matchAll(CODE_TOKEN)].find((m) => {
        const i = m.index ?? 0;
        return has(CODE_PREFIX, c.norm.slice(Math.max(0, i - 30), i));
      });
      return hit
        ? f(
            "utility-discount-code",
            "error",
            `Looks like a discount code (${hit[0]}) in a UTILITY template.`,
            true,
          )
        : [];
    },
  },
  {
    id: "utility-urgency",
    describe: "Urgency / scarcity language in a UTILITY template.",
    check: (c) => {
      if (c.category !== "UTILITY") return [];
      const hits = all(URGENCY, c.norm);
      return hits.length
        ? f(
            "utility-urgency",
            "error",
            `Urgency wording ("${hits[0]}") in a UTILITY template.`,
            true,
          )
        : [];
    },
  },
  {
    id: "auth-has-link",
    describe: "AUTHENTICATION templates must not contain links.",
    check: (c) =>
      c.category === "AUTHENTICATION" &&
      (has(URL_RE, c.body) || has(SHORTENERS, c.norm))
        ? f(
            "auth-has-link",
            "error",
            "AUTHENTICATION template contains a link.",
          )
        : [],
  },
  {
    id: "auth-no-variable",
    describe: "AUTHENTICATION templates need the code variable.",
    check: (c) =>
      c.category === "AUTHENTICATION" && c.tokens.length === 0
        ? f(
            "auth-no-variable",
            "error",
            "AUTHENTICATION template has no {{1}} for the one-time code.",
          )
        : [],
  },
  {
    id: "marketing-no-optout",
    describe: "Marketing templates should offer an opt-out.",
    check: (c) => {
      if (c.category !== "MARKETING") return [];
      const inBtn = (c.buttons ?? []).some((b) =>
        has(OPT_OUT, normalizeText(b.text ?? "")),
      );
      return has(OPT_OUT, c.norm) || inBtn
        ? []
        : f(
            "marketing-no-optout",
            "info",
            "No opt-out hint (e.g. 'Reply STOP to unsubscribe'). Recommended for marketing sends.",
          );
    },
  },
  {
    id: "excessive-caps",
    describe: "More than half of the letters are uppercase.",
    check: (c) => {
      const letters = [...c.textOnly].filter((ch) => /\p{L}/u.test(ch));
      const upper = letters.filter((ch) => ch !== ch.toLowerCase());
      return letters.length >= 12 && upper.length / letters.length > 0.5
        ? f("excessive-caps", "warn", "Mostly UPPERCASE text reads as spam.")
        : [];
    },
  },
  {
    id: "excessive-emoji",
    describe: "More than 3 emoji.",
    check: (c) =>
      (c.body.match(/\p{Extended_Pictographic}/gu) ?? []).length > 3
        ? f(
            "excessive-emoji",
            "warn",
            "More than 3 emoji; keep transactional messages plain.",
          )
        : [],
  },
  {
    id: "excessive-punctuation",
    describe: "Runs of !!! or ???",
    check: (c) =>
      /[!?！？]{3,}/u.test(c.body)
        ? f(
            "excessive-punctuation",
            "warn",
            "Repeated !!! or ??? looks promotional.",
          )
        : [],
  },
  {
    id: "excessive-newlines",
    describe: "3+ consecutive line breaks or 4+ consecutive spaces.",
    check: (c) =>
      /\n{3,}/.test(c.body) || / {4,}/.test(c.body)
        ? f(
            "excessive-newlines",
            "warn",
            "3+ consecutive line breaks or 4+ spaces in body.",
          )
        : [],
  },
];
