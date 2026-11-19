export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function maskPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\.\d{3})(\d)/, "$1-$2");
}

export function maskCnpj(value: string) {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\.\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskCpfCnpj(value: string) {
  return onlyDigits(value).length <= 11 ? maskCpf(value) : maskCnpj(value);
}

export function maskPixKey(type: string, value: string) {
  if (type === "cpf") return maskCpf(value);
  if (type === "cnpj") return maskCnpj(value);
  if (type === "telefone") {
    const d = onlyDigits(value);
    if (d.length > 11 && d.startsWith("55")) return `+55 ${maskPhone(d.slice(2))}`;
    return maskPhone(value);
  }
  return value;
}

export function normalizePixKey(type: string, value: string) {
  if (["cpf", "cnpj", "telefone"].includes(type)) {
    const d = onlyDigits(value);
    return type === "telefone" && d.length > 11 && d.startsWith("55") ? `+${d}` : d;
  }
  return value.trim();
}
