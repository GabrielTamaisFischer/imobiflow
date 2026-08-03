export const kiwifyLinks = {
  salesPage: "https://kiwify.app/FejQ33s",
  start: "https://pay.kiwify.com.br/YmVd46n",
  pro: "https://pay.kiwify.com.br/zlmmvgv",
  enterprise: "https://pay.kiwify.com.br/rbeAEEn",
} as const;

export const planCheckoutLinks = {
  start: kiwifyLinks.start,
  pro: kiwifyLinks.pro,
  enterprise: kiwifyLinks.enterprise,
} as const;
