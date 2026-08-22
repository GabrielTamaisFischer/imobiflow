export function normalizeBrazilianDocument(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 14);
}

function repeated(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 11 || repeated(digits)) return false;
  for (let position = 9; position <= 10; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) sum += Number(digits[index]) * (position + 1 - index);
    const remainder = (sum * 10) % 11;
    if ((remainder === 10 ? 0 : remainder) !== Number(digits[position])) return false;
  }
  return true;
}

export function isValidCnpj(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 14 || repeated(digits)) return false;
  const digit = (length: 12 | 13) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const remainder = weights.reduce((sum, weight, index) => sum + Number(digits[index]) * weight, 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(12) === Number(digits[12]) && digit(13) === Number(digits[13]);
}

export function isValidBrazilianDocument(value: string, ownerType: "individual" | "company") {
  const normalized = normalizeBrazilianDocument(value);
  if (!normalized) return true;
  return ownerType === "company" ? isValidCnpj(normalized) : isValidCpf(normalized);
}
