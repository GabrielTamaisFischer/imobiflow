export const AGENDA_LOCALES = [
  "pt-BR", "pt-PT", "en-US", "en-GB", "es-ES", "es-MX", "fr-FR", "de-DE",
  "it-IT", "nl-NL", "ja-JP", "ko-KR", "zh-CN", "zh-TW", "ar-SA", "hi-IN",
] as const;

export const AGENDA_COUNTRIES = [
  "BR", "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE",
  "US", "CA", "GB", "IE", "PT", "ES", "FR", "DE", "IT", "NL", "BE", "CH", "AT", "SE", "NO", "DK", "FI", "AU", "NZ", "JP", "CN", "KR", "IN", "ZA",
] as const;

const COUNTRY_ZONE_PREFIXES: Record<string, string[]> = {
  BR: ["America/Araguaina", "America/Bahia", "America/Belem", "America/Boa_Vista", "America/Campo_Grande", "America/Cuiaba", "America/Eirunepe", "America/Fortaleza", "America/Maceio", "America/Manaus", "America/Noronha", "America/Porto_Velho", "America/Recife", "America/Rio_Branco", "America/Santarem", "America/Sao_Paulo"],
  US: ["America/Adak", "America/Anchorage", "America/Chicago", "America/Denver", "America/Detroit", "America/Indiana/", "America/Los_Angeles", "America/New_York", "America/Nome", "America/Phoenix", "America/Sitka", "America/Yakutat"],
  CA: ["America/Edmonton", "America/Halifax", "America/Moncton", "America/Montreal", "America/Regina", "America/St_Johns", "America/Toronto", "America/Vancouver", "America/Winnipeg"],
  GB: ["Europe/London"], IE: ["Europe/Dublin"], PT: ["Atlantic/Azores", "Atlantic/Madeira", "Europe/Lisbon"], ES: ["Atlantic/Canary", "Europe/Madrid"],
  FR: ["Europe/Paris"], DE: ["Europe/Berlin"], IT: ["Europe/Rome"], NL: ["Europe/Amsterdam"], JP: ["Asia/Tokyo"], CN: ["Asia/Shanghai"], KR: ["Asia/Seoul"], IN: ["Asia/Calcutta"], AU: ["Australia/"], NZ: ["Pacific/Auckland"],
};

export function agendaTimeZones(country?: string) {
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const zones = supported ? supported("timeZone") : ["America/Sao_Paulo", "UTC", "America/New_York", "Europe/Lisbon", "Europe/London", "Asia/Tokyo"];
  const prefixes = country ? COUNTRY_ZONE_PREFIXES[country.toUpperCase()] : undefined;
  if (!prefixes) return zones;
  const filtered = zones.filter((zone) => prefixes.some((prefix) => prefix.endsWith("/") ? zone.startsWith(prefix) : zone === prefix));
  return filtered.length ? filtered : zones;
}

export function formatTimeZoneLabel(zone: string, date = new Date()) {
  try {
    const offset = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "";
    const city = zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone;
    return `${city} (${offset}) — ${zone}`;
  } catch {
    return zone;
  }
}
