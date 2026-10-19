export function formatCep(value: string) {
  return value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

const brazilDddState: Record<string, string> = {
  "11":"SP","12":"SP","13":"SP","14":"SP","15":"SP","16":"SP","17":"SP","18":"SP","19":"SP",
  "21":"RJ","22":"RJ","24":"RJ","27":"ES","28":"ES","31":"MG","32":"MG","33":"MG","34":"MG","35":"MG","37":"MG","38":"MG",
  "41":"PR","42":"PR","43":"PR","44":"PR","45":"PR","46":"PR","47":"SC","48":"SC","49":"SC",
  "51":"RS","53":"RS","54":"RS","55":"RS","61":"DF","62":"GO","64":"GO","63":"TO",
  "65":"MT","66":"MT","67":"MS","68":"AC","69":"RO","71":"BA","73":"BA","74":"BA","75":"BA","77":"BA",
  "79":"SE","81":"PE","87":"PE","82":"AL","83":"PB","84":"RN","85":"CE","88":"CE","86":"PI","89":"PI",
  "91":"PA","93":"PA","94":"PA","92":"AM","97":"AM","95":"RR","96":"AP","98":"MA","99":"MA",
};

export function parsePhone(value: string) {
  let digits = value.replace(/\D/g, "").slice(0, 15);
  if (!digits) return { countryCode: "", ddd: "", state: "", subscriber: "" };

  let countryCode = "55";
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  } else if (digits.length > 11) {
    const localLength = digits.length >= 12 ? 11 : 10;
    countryCode = digits.slice(0, Math.max(1, digits.length - localLength));
    digits = digits.slice(countryCode.length);
  }

  const ddd = countryCode === "55" && digits.length >= 2 ? digits.slice(0, 2) : "";
  const subscriber = ddd ? digits.slice(2) : digits;
  return { countryCode, ddd, state: ddd ? brazilDddState[ddd] ?? "" : "", subscriber };
}

export function formatInternationalPhone(value: string) {
  const parsed = parsePhone(value);
  if (!parsed.countryCode) return "";
  if (parsed.countryCode === "55") {
    const local = parsed.subscriber.slice(0, 9);
    const formattedLocal = local.length <= 8
      ? local.replace(/^(\d{4})(\d)/, "$1-$2")
      : local.replace(/^(\d{5})(\d)/, "$1-$2");
    return parsed.ddd
      ? `+55 (${parsed.ddd}) ${formattedLocal}`
      : `+55 ${formattedLocal}`;
  }
  const groups = parsed.subscriber.match(/.{1,4}/g)?.join(" ") ?? parsed.subscriber;
  return `+${parsed.countryCode} ${groups}`.trim();
}

export function phoneHint(value: string) {
  const parsed = parsePhone(value);
  if (!parsed.countryCode) return "";
  if (parsed.countryCode === "55" && parsed.ddd) {
    return `Brasil · DDD ${parsed.ddd}${parsed.state ? ` · ${parsed.state}` : ""}`;
  }
  return `Código do país +${parsed.countryCode}`;
}

export function formatCreci(value: string) {
  const upper = value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 16);
  const compact = upper.replace(/-/g, "");
  const match = compact.match(/^(\d{1,8})([FPJ]?)$/);
  if (!match) return upper;
  const [, number, suffix] = match;
  return suffix ? `${number}-${suffix}` : number;
}
