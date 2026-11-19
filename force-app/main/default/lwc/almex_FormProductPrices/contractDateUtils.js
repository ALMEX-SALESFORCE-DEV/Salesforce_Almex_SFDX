export function parseContractDate(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || "").trim());
  if (!match) return undefined;
  const [, day, month, year] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900 &&
    year <= 2100 &&
    date.getFullYear() === year &&
    date.getMonth() + 1 === month &&
    date.getDate() === day
    ? date
    : undefined;
}

export function formatContractDateEntry(text, deleting) {
  if (!/^[\d/]*$/.test(text)) return text;
  const digits = text.replace(/\D/g, "").slice(0, 8);
  const keepTrailingSlash = !deleting || text.endsWith("/");
  const daySeparator =
    digits.length > 2 || (digits.length === 2 && keepTrailingSlash);
  const monthSeparator =
    digits.length > 4 || (digits.length === 4 && keepTrailingSlash);
  return (
    digits.slice(0, 2) +
    (daySeparator ? "/" : "") +
    digits.slice(2, 4) +
    (monthSeparator ? "/" : "") +
    digits.slice(4)
  );
}
