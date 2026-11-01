// A Philippine school year runs from June to May: June 2025 to May 2026 is
// "2025-2026". The label shown to people is "S.Y. 2025-2026".
export function schoolYearOf(date: Date = new Date()): string {
  const start = date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export function schoolYearLabel(sy: string): string {
  return `S.Y. ${sy}`;
}
