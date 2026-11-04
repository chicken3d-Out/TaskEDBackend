import { BadRequestException } from '@nestjs/common';
// A Philippine school year runs from June to May: June 2025 to May 2026 is
// "2025-2026". The label shown to people is "S.Y. 2025-2026".
export function schoolYearOf(date: Date = new Date()): string {
  const start = date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export function schoolYearLabel(sy: string): string {
  return `S.Y. ${sy}`;
}

// Accepts "2025-2026" only (second year = first + 1).
export function validSchoolYear(sy: string): string {
  const m = /^(\d{4})-(\d{4})$/.exec((sy ?? '').trim());
  if (!m || Number(m[2]) !== Number(m[1]) + 1 || Number(m[1]) < 2000 || Number(m[1]) > 2100) {
    throw new BadRequestException('School year must look like 2026-2027');
  }
  return `${m[1]}-${m[2]}`;
}
