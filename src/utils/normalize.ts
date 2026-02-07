export function normalizePlateNo(input: string) {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}
