import { describe, expect, it } from "vitest";
import { RULES, lintTemplate, type TemplateInput } from "../src/lint/index.js";

const ids = (t: TemplateInput) => lintTemplate(t).findings.map((f) => f.rule);

interface Case {
  name: string;
  input: TemplateInput;
  /** rules that MUST fire */
  has?: string[];
  /** rules that must NOT fire */
  not?: string[];
  passed?: boolean;
  risk?: "none" | "medium" | "high";
}

const U = "UTILITY" as const;
const M = "MARKETING" as const;
const A = "AUTHENTICATION" as const;
const S3 = ["a", "b", "c"];

const cases: Case[] = [
  // ---- good templates, five languages ----
  {
    name: "EN good utility",
    input: {
      category: U,
      body: "Hi {{1}}, your order {{2}} has shipped and will arrive by {{3}}. Track it in your account.",
      samples: S3,
    },
    passed: true,
    risk: "none",
  },
  {
    name: "ES good utility",
    input: {
      category: U,
      body: "Hola {{1}}, tu cita está confirmada para el {{2}} a las {{3}}. Responde a este mensaje si necesitas cambiarla.",
      samples: S3,
    },
    passed: true,
    risk: "none",
  },
  {
    name: "PT good utility",
    input: {
      category: U,
      body: "Olá {{1}}, seu pedido {{2}} foi enviado e chega até {{3}}. Responda aqui se precisar de ajuda.",
      samples: S3,
    },
    passed: true,
    risk: "none",
  },
  {
    name: "AR good utility",
    input: {
      category: U,
      body: "مرحبا {{1}}، تم تأكيد موعدك يوم {{2}} الساعة {{3}}. يمكنك الرد على هذه الرسالة لتغيير الموعد.",
      samples: S3,
    },
    passed: true,
    risk: "none",
  },
  {
    name: "ID good utility",
    input: {
      category: U,
      body: "Halo {{1}}, pesanan {{2}} sudah dikirim dan tiba pada {{3}}. Balas pesan ini jika perlu bantuan.",
      samples: S3,
    },
    passed: true,
    risk: "none",
  },
  {
    name: "EN good marketing with opt-out",
    input: {
      category: M,
      body: "Hi {{1}}, our new spring menu is here. Reply STOP to unsubscribe.",
      samples: ["Ana"],
    },
    passed: true,
    not: ["marketing-no-optout"],
  },
  {
    name: "good authentication",
    input: {
      category: A,
      body: "{{1}} is your verification code. Do not share it.",
      samples: ["123456"],
    },
    not: ["auth-no-variable", "auth-has-link"],
  },

  // ---- promo wording in UTILITY, five languages ----
  {
    name: "EN promo word",
    input: {
      category: U,
      body: "Hi {{1}}, enjoy a discount on your next order with us today.",
    },
    has: ["utility-promo-words"],
    risk: "high",
    passed: false,
  },
  {
    name: "EN percent off",
    input: {
      category: U,
      body: "Hi {{1}}, get 20% off your next delivery from our shop.",
    },
    has: ["utility-promo-words"],
    risk: "high",
  },
  {
    name: "ES promo word",
    input: {
      category: U,
      body: "Hola {{1}}, aprovecha nuestro descuento en tu próxima compra con nosotros.",
    },
    has: ["utility-promo-words"],
    risk: "high",
  },
  {
    name: "PT promo word",
    input: {
      category: U,
      body: "Olá {{1}}, aproveite o desconto no seu próximo pedido conosco.",
    },
    has: ["utility-promo-words"],
    risk: "high",
  },
  {
    name: "AR promo word",
    input: {
      category: U,
      body: "مرحبا {{1}}، استمتع بخصم على طلبك القادم معنا.",
    },
    has: ["utility-promo-words"],
    risk: "high",
  },
  {
    name: "ID promo word",
    input: {
      category: U,
      body: "Halo {{1}}, nikmati diskon untuk pesanan berikutnya bersama kami.",
    },
    has: ["utility-promo-words"],
    risk: "high",
  },
  {
    name: "promo words are fine in MARKETING",
    input: {
      category: M,
      body: "Hi {{1}}, enjoy a discount on your next order. Reply STOP to unsubscribe.",
    },
    not: ["utility-promo-words", "utility-urgency"],
  },
  {
    name: "word 'free' inside another word does not trigger",
    input: {
      category: U,
      body: "Hi {{1}}, your carefree booking {{2}} is confirmed for {{3}}.",
      samples: S3,
    },
    not: ["utility-promo-words"],
  },

  // ---- urgency, five languages ----
  {
    name: "EN urgency",
    input: {
      category: U,
      body: "Hi {{1}}, your order {{2}} is ready. Hurry, pick it up before closing time.",
    },
    has: ["utility-urgency"],
    risk: "high",
  },
  {
    name: "EN limited time",
    input: {
      category: U,
      body: "Hi {{1}}, this is available for a limited time only at our store.",
    },
    has: ["utility-urgency"],
  },
  {
    name: "ES urgency",
    input: {
      category: U,
      body: "Hola {{1}}, tu pedido está listo. Es por tiempo limitado en nuestra tienda.",
    },
    has: ["utility-urgency"],
  },
  {
    name: "PT urgency",
    input: {
      category: U,
      body: "Olá {{1}}, seu pedido está pronto. Esta é a última chance de retirar na loja.",
    },
    has: ["utility-urgency"],
  },
  {
    name: "AR urgency",
    input: {
      category: U,
      body: "مرحبا {{1}}، طلبك جاهز للاستلام اليوم فقط من المتجر.",
    },
    has: ["utility-urgency"],
  },
  {
    name: "ID urgency",
    input: {
      category: U,
      body: "Halo {{1}}, pesanan Anda siap diambil hari ini saja di toko kami.",
    },
    has: ["utility-urgency"],
  },

  // ---- discount codes ----
  {
    name: "EN discount code",
    input: {
      category: U,
      body: "Hi {{1}}, thanks for your order. Use code SAVE20 at checkout next time.",
    },
    has: ["utility-discount-code"],
    risk: "high",
  },
  {
    name: "ES discount code",
    input: {
      category: U,
      body: "Hola {{1}}, gracias por tu compra. Usa el código VERANO25 la próxima vez.",
    },
    has: ["utility-discount-code"],
  },
  {
    name: "ID discount code",
    input: {
      category: U,
      body: "Halo {{1}}, terima kasih. Gunakan kode HEMAT10 untuk pesanan berikutnya.",
    },
    has: ["utility-discount-code"],
  },
  {
    name: "numeric code is not a discount code",
    input: {
      category: U,
      body: "Hi {{1}}, your reference code 884213 is valid for this booking.",
    },
    not: ["utility-discount-code"],
  },

  // ---- links ----
  {
    name: "URL shortener in body",
    input: {
      category: U,
      body: "Hi {{1}}, track your parcel at bit.ly/abc123 anytime today.",
    },
    has: ["url-shortener"],
    passed: false,
  },
  {
    name: "tinyurl in body",
    input: {
      category: U,
      body: "Hi {{1}}, see https://tinyurl.com/xyz for details of your booking.",
    },
    has: ["url-shortener"],
  },
  {
    name: "URL shortener in button",
    input: {
      category: U,
      body: "Hi {{1}}, your booking is confirmed for tomorrow.",
      buttons: [{ type: "URL", text: "View", url: "https://bit.ly/x" }],
    },
    has: ["button-url-shortener"],
  },
  {
    name: "full domain is fine",
    input: {
      category: U,
      body: "Hi {{1}}, track your parcel at https://example.com/track/{{2}} any time.",
      samples: ["a", "b"],
    },
    not: ["url-shortener"],
  },
  {
    name: "wa.me link",
    input: {
      category: U,
      body: "Hi {{1}}, chat with us at wa.me/15551234567 if you need anything.",
    },
    has: ["wa-me-link"],
  },
  {
    name: "wa.me in button url",
    input: {
      category: U,
      body: "Hi {{1}}, your booking is confirmed for tomorrow.",
      buttons: [
        { type: "URL", text: "Chat", url: "https://wa.me/15551234567" },
      ],
    },
    has: ["wa-me-link"],
  },
  {
    name: "http link warns",
    input: {
      category: U,
      body: "Hi {{1}}, see http://example.com/booking for the details of your visit.",
    },
    has: ["insecure-url"],
  },

  // ---- placeholders ----
  {
    name: "adjacent variables",
    input: {
      category: U,
      body: "Hi there, your slot is {{1}}{{2}} and we look forward to seeing you.",
    },
    has: ["adjacent-variables"],
    passed: false,
  },
  {
    name: "leading variable",
    input: {
      category: U,
      body: "{{1}}, your order has shipped and is on its way to you now.",
    },
    has: ["leading-variable"],
  },
  {
    name: "trailing variable",
    input: {
      category: U,
      body: "Your order has shipped and is on its way, tracking number {{1}}",
    },
    has: ["trailing-variable"],
  },
  {
    name: "placeholder gap",
    input: {
      category: U,
      body: "Hi {{1}}, your order {{3}} has shipped and is on its way to you.",
    },
    has: ["placeholder-gaps"],
  },
  {
    name: "placeholders must start at 1",
    input: {
      category: U,
      body: "Hi {{2}}, your order has shipped and is on its way to you now.",
    },
    has: ["placeholder-gaps"],
  },
  {
    name: "named placeholder",
    input: {
      category: U,
      body: "Hi {{name}}, your order has shipped and is on its way to you now.",
    },
    has: ["malformed-placeholder"],
  },
  {
    name: "spaced placeholder",
    input: {
      category: U,
      body: "Hi {{ 1 }}, your order has shipped and is on its way to you now.",
    },
    has: ["malformed-placeholder"],
  },
  {
    name: "unbalanced braces",
    input: {
      category: U,
      body: "Hi {{1}}, your order has shipped {{ and is on its way to you now.",
    },
    has: ["malformed-placeholder"],
  },
  {
    name: "variable-to-text ratio",
    input: {
      category: U,
      body: "Hi {{1}} {{2}} and {{3}} for {{4}} on {{5}}.",
    },
    has: ["variable-ratio"],
  },
  {
    name: "missing samples",
    input: {
      category: U,
      body: "Hi {{1}}, your order {{2}} has shipped and is on its way to you.",
    },
    has: ["missing-samples"],
  },
  {
    name: "partial samples",
    input: {
      category: U,
      body: "Hi {{1}}, your order {{2}} has shipped and is on its way to you.",
      samples: ["Ana"],
    },
    has: ["missing-samples"],
  },
  {
    name: "samples complete",
    input: {
      category: U,
      body: "Hi {{1}}, your order {{2}} has shipped and is on its way to you.",
      samples: ["Ana", "#42"],
    },
    not: ["missing-samples"],
  },
  {
    name: "sample with newline",
    input: {
      category: U,
      body: "Hi {{1}}, your order has shipped and is on its way to you.",
      samples: ["Ana\nLee"],
    },
    has: ["sample-invalid"],
  },

  // ---- sizes & buttons ----
  {
    name: "body over 1024",
    input: { category: U, body: "a".repeat(1025) },
    has: ["body-too-long"],
  },
  {
    name: "body exactly 1024 is fine",
    input: { category: U, body: "a".repeat(1024) },
    not: ["body-too-long"],
  },
  {
    name: "empty body",
    input: { category: U, body: "  " },
    has: ["body-empty"],
    passed: false,
  },
  {
    name: "header over 60",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      header: "h".repeat(61),
    },
    has: ["header-too-long"],
  },
  {
    name: "header with two variables",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      header: "Hi {{1}} and {{2}}",
    },
    has: ["header-multiple-vars"],
  },
  {
    name: "header with emoji",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      header: "Booking confirmed ✅",
    },
    has: ["header-formatting"],
  },
  {
    name: "button text over 25",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: [{ type: "QUICK_REPLY", text: "x".repeat(26) }],
    },
    has: ["button-text-too-long"],
  },
  {
    name: "button text exactly 25 is fine",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: [{ type: "QUICK_REPLY", text: "x".repeat(25) }],
    },
    not: ["button-text-too-long"],
  },
  {
    name: "empty button text",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: [{ type: "QUICK_REPLY", text: " " }],
    },
    has: ["button-text-empty"],
  },
  {
    name: "4 quick replies",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: ["a", "b", "c", "d"].map((t) => ({
        type: "QUICK_REPLY",
        text: t,
      })),
    },
    has: ["too-many-quick-replies"],
  },
  {
    name: "3 quick replies is fine",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: ["a", "b", "c"].map((t) => ({ type: "QUICK_REPLY", text: t })),
    },
    not: ["too-many-quick-replies"],
  },
  {
    name: "11 buttons",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: Array.from({ length: 11 }, (_, i) => ({
        type: "QUICK_REPLY",
        text: "b" + i,
      })),
    },
    has: ["too-many-buttons"],
  },
  {
    name: "3 url buttons",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: [1, 2, 3].map((i) => ({
        type: "URL",
        text: "L" + i,
        url: "https://example.com/" + i,
      })),
    },
    has: ["too-many-url-buttons"],
  },
  {
    name: "2 phone buttons",
    input: {
      category: U,
      body: "Your booking is confirmed for tomorrow morning.",
      buttons: [1, 2].map((i) => ({ type: "PHONE_NUMBER", text: "Call" + i })),
    },
    has: ["too-many-phone-buttons"],
  },

  // ---- authentication ----
  {
    name: "auth with link",
    input: {
      category: A,
      body: "{{1}} is your code. Verify at https://example.com now.",
    },
    has: ["auth-has-link"],
  },
  {
    name: "auth without variable",
    input: {
      category: A,
      body: "Your verification code is ready, do not share it.",
    },
    has: ["auth-no-variable"],
  },
  {
    name: "promo words are not checked on AUTH",
    input: {
      category: A,
      body: "{{1}} is your free verification code. Do not share it.",
    },
    not: ["utility-promo-words"],
  },

  // ---- marketing ----
  {
    name: "marketing without opt-out is info only",
    input: {
      category: M,
      body: "Hi {{1}}, our new spring menu is now available at all branches.",
      samples: ["Ana"],
    },
    has: ["marketing-no-optout"],
    passed: true,
  },
  {
    name: "ES opt-out recognised",
    input: {
      category: M,
      body: "Hola {{1}}, nuevo menú de primavera. Responde BAJA para darte de baja.",
      samples: ["Ana"],
    },
    not: ["marketing-no-optout"],
  },
  {
    name: "ID opt-out recognised",
    input: {
      category: M,
      body: "Halo {{1}}, menu baru telah tersedia. Balas BERHENTI untuk berhenti.",
      samples: ["Ana"],
    },
    not: ["marketing-no-optout"],
  },

  // ---- style ----
  {
    name: "all caps",
    input: {
      category: U,
      body: "YOUR ORDER HAS SHIPPED AND WILL ARRIVE TOMORROW MORNING",
    },
    has: ["excessive-caps"],
  },
  {
    name: "4 emoji",
    input: {
      category: U,
      body: "Your order shipped 🚀🚀🚀🚀 and will arrive tomorrow.",
    },
    has: ["excessive-emoji"],
  },
  {
    name: "!!! punctuation",
    input: {
      category: U,
      body: "Your order has shipped and will arrive tomorrow morning!!!",
    },
    has: ["excessive-punctuation"],
  },
  {
    name: "3 blank lines",
    input: {
      category: U,
      body: "Your order has shipped.\n\n\nIt will arrive tomorrow morning.",
    },
    has: ["excessive-newlines"],
  },
  {
    name: "marketing style on UTILITY gives medium risk",
    input: {
      category: U,
      body: "Your order has shipped and will arrive tomorrow morning!!!",
    },
    risk: "medium",
  },
  {
    name: "invalid category",
    input: {
      category: "SOMETHING" as any,
      body: "Your order has shipped and will arrive tomorrow morning.",
    },
    has: ["invalid-category"],
  },
];

describe("template linter: cases", () => {
  it("has 40+ cases across EN/ES/PT/AR/ID", () => {
    expect(cases.length).toBeGreaterThanOrEqual(40);
  });
  for (const c of cases) {
    it(c.name, () => {
      const r = lintTemplate(c.input);
      const got = r.findings.map((f) => f.rule);
      for (const h of c.has ?? [])
        expect(got, `expected rule ${h}`).toContain(h);
      for (const n of c.not ?? [])
        expect(got, `unexpected rule ${n}`).not.toContain(n);
      if (c.passed !== undefined) expect(r.passed).toBe(c.passed);
      if (c.risk) expect(r.reclassificationRisk).toBe(c.risk);
    });
  }
});

describe("template linter: structure", () => {
  it("ships 30+ rules, each with a unique id", () => {
    expect(RULES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
  it("reports rulesChecked and a summary", () => {
    const r = lintTemplate({
      category: U,
      body: "Hi {{1}}, enjoy a discount on your next order with us today.",
    });
    expect(r.rulesChecked).toBe(RULES.length);
    expect(r.summary.errors).toBeGreaterThan(0);
    expect(r.reclassificationReasons.length).toBeGreaterThan(0);
  });
  it("is deterministic and side-effect free", () => {
    const t: TemplateInput = {
      category: U,
      body: "Hi {{1}}, use code SAVE20 for a discount.",
    };
    expect(ids(t)).toEqual(ids(t));
  });
  it("accepts a lower-case category string", () => {
    expect(
      lintTemplate({
        category: "utility" as any,
        body: "Hi {{1}}, enjoy a discount on your next order with us.",
      }).reclassificationRisk,
    ).toBe("high");
  });
});
