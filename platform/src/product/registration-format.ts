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
  const raw = value.trim();
  const explicitInternational = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "").slice(0, 15);

  if (!digits) {
    return { countryCode: "", ddd: "", state: "", subscriber: "", explicitInternational: false };
  }

  if (explicitInternational) {
    if (digits.startsWith("55")) {
      digits = digits.slice(2);
      const ddd = digits.length >= 2 ? digits.slice(0, 2) : "";
      const subscriber = ddd ? digits.slice(2, 11) : digits.slice(0, 9);
      return {
        countryCode: "55",
        ddd,
        state: ddd ? brazilDddState[ddd] ?? "" : "",
        subscriber,
        explicitInternational: true,
      };
    }

    const localLength = digits.length > 11 ? 11 : Math.max(0, digits.length - 1);
    const countryLength = Math.max(1, digits.length - localLength);
    return {
      countryCode: digits.slice(0, countryLength),
      ddd: "",
      state: "",
      subscriber: digits.slice(countryLength),
      explicitInternational: true,
    };
  }

  // Digitação normal no Brasil: o usuário informa apenas DDD + número.
  // Não inserimos +55 no valor do input durante a digitação.
  const localDigits = digits.slice(0, 11);
  const ddd = localDigits.length >= 2 ? localDigits.slice(0, 2) : "";
  return {
    countryCode: "55",
    ddd,
    state: ddd ? brazilDddState[ddd] ?? "" : "",
    subscriber: ddd ? localDigits.slice(2) : localDigits,
    explicitInternational: false,
  };
}

export function formatInternationalPhone(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  const parsed = parsePhone(value);

  if (parsed.explicitInternational && parsed.countryCode !== "55") {
    const groups = parsed.subscriber.match(/.{1,4}/g)?.join(" ") ?? parsed.subscriber;
    return `+${parsed.countryCode}${groups ? ` ${groups}` : ""}`;
  }

  const localDigits =
    parsed.countryCode === "55"
      ? `${parsed.ddd}${parsed.subscriber}`.slice(0, 11)
      : digits.slice(0, 11);

  if (localDigits.length <= 2) return localDigits;

  const ddd = localDigits.slice(0, 2);
  const subscriber = localDigits.slice(2);
  if (!subscriber) return ddd;

  const formattedSubscriber =
    subscriber.length <= 8
      ? subscriber.replace(/^(\d{4})(\d)/, "$1-$2")
      : subscriber.replace(/^(\d{5})(\d)/, "$1-$2");

  return `(${ddd}) ${formattedSubscriber}`;
}

export function normalizePhoneForStorage(value: string) {
  const parsed = parsePhone(value);
  if (!parsed.countryCode) return "";
  if (parsed.countryCode === "55") {
    const local = `${parsed.ddd}${parsed.subscriber}`;
    return local ? `+55${local}` : "";
  }
  return parsed.explicitInternational ? `+${parsed.countryCode}${parsed.subscriber}` : value.replace(/\D/g, "");
}

export function phoneHint(value: string) {
  const parsed = parsePhone(value);
  if (!parsed.ddd && !parsed.explicitInternational) return "Digite DDD + número";
  if (parsed.countryCode === "55" && parsed.ddd) {
    return `Brasil · DDD ${parsed.ddd}${parsed.state ? ` · ${parsed.state}` : ""}`;
  }
  if (parsed.explicitInternational && parsed.countryCode) {
    return `Código do país +${parsed.countryCode}`;
  }
  return "Digite DDD + número";
}

export function formatCreci(value: string) {
  const upper = value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 16);
  const compact = upper.replace(/-/g, "");
  const match = compact.match(/^(\d{1,8})([FPJ]?)$/);
  if (!match) return upper;
  const [, number, suffix] = match;
  return suffix ? `${number}-${suffix}` : number;
}
