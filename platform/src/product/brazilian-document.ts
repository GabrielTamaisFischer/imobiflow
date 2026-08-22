export function normalizeBrazilianDocument(value: string) {
  return value.replace(/\D/g, "").slice(0, 14);
}

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value);
}

export function isValidCpf(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 11 || hasRepeatedDigits(digits)) return false;

  for (let position = 9; position <= 10; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(digits[index]) * (position + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    const checkDigit = remainder === 10 ? 0 : remainder;
    if (checkDigit !== Number(digits[position])) return false;
  }
  return true;
}

export function isValidCnpj(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length !== 14 || hasRepeatedDigits(digits)) return false;

  const calculateDigit = (length: number) => {
    const weights = length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calculateDigit(12) === Number(digits[12]) && calculateDigit(13) === Number(digits[13]);
}

export function isValidBrazilianDocument(value: string, ownerType?: "individual" | "company") {
  const digits = normalizeBrazilianDocument(value);
  if (!digits) return true;
  if (ownerType === "individual") return isValidCpf(digits);
  if (ownerType === "company") return isValidCnpj(digits);
  return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
}

export function formatBrazilianDocument(value: string) {
  const digits = normalizeBrazilianDocument(value);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\/\d{4})(\d)/, "$1-$2");
}
