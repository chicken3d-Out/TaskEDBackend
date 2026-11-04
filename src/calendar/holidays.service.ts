import { Injectable, Logger } from '@nestjs/common';
import * as ical from 'node-ical';

export interface Holiday {
  date: string; // YYYY-MM-DD
  title: string;
}

const DAY = 24 * 60 * 60 * 1000;
// Google's public "Holidays in the Philippines" calendar. It is public, so no
// sign-in or permission is needed; the server reads it like any website.
export const PH_HOLIDAYS_URL =
  'https://calendar.google.com/calendar/ical/en.philippines%23holiday%40group.v.calendar.google.com/public/basic.ics';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// Used only when Google cannot be reached: fixed-date holidays plus Holy Week.
// Movable ones (such as Eid) are only in Google's calendar.
function fallbackFor(year: number): Holiday[] {
  const out: Holiday[] = [
    { date: ymd(year, 1, 1), title: "New Year's Day" },
    { date: ymd(year, 2, 25), title: 'EDSA People Power Revolution Anniversary' },
    { date: ymd(year, 4, 9), title: 'Day of Valor (Araw ng Kagitingan)' },
    { date: ymd(year, 5, 1), title: 'Labor Day' },
    { date: ymd(year, 6, 12), title: 'Independence Day' },
    { date: ymd(year, 8, 21), title: 'Ninoy Aquino Day' },
    { date: ymd(year, 11, 1), title: "All Saints' Day" },
    { date: ymd(year, 11, 30), title: 'Bonifacio Day' },
    { date: ymd(year, 12, 8), title: 'Feast of the Immaculate Conception' },
    { date: ymd(year, 12, 24), title: 'Christmas Eve' },
    { date: ymd(year, 12, 25), title: 'Christmas Day' },
    { date: ymd(year, 12, 30), title: 'Rizal Day' },
    { date: ymd(year, 12, 31), title: "New Year's Eve" },
  ];
  // National Heroes Day: last Monday of August
  const aug = new Date(year, 7, 31);
  while (aug.getDay() !== 1) aug.setDate(aug.getDate() - 1);
  out.push({ date: ymd(year, 8, aug.getDate()), title: 'National Heroes Day' });
  // Easter (Meeus/Jones/Butcher), then Maundy Thursday to Black Saturday
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  for (const [back, title] of [[3, 'Maundy Thursday'], [2, 'Good Friday'], [1, 'Black Saturday']] as const) {
    const x = new Date(easter.getTime() - back * DAY);
    out.push({ date: ymd(x.getFullYear(), x.getMonth() + 1, x.getDate()), title });
  }
  return out;
}

@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);
  private cache: { at: number; ttl: number; items: Holiday[]; source: 'google' | 'fallback' } | null = null;

  private async fromGoogle(): Promise<Holiday[]> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(PH_HOLIDAYS_URL, { signal: ctrl.signal, redirect: 'manual' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('not a calendar');
      const parsed = ical.parseICS(text);
      const from = Date.now() - 60 * DAY;
      const to = Date.now() + 500 * DAY;
      const seen = new Set<string>();
      const items: Holiday[] = [];
      for (const it of Object.values(parsed)) {
        const ev: any = it;
        if (!ev || ev.type !== 'VEVENT' || !ev.start) continue;
        let instances: any[] = [ev];
        if (ev.rrule) {
          try {
            instances = ical.expandRecurringEvent(ev, { from: new Date(from), to: new Date(to) }) as any[];
          } catch {
            continue;
          }
        }
        for (const inst of instances) {
          const s: Date = inst.start ?? ev.start;
          if (!s || isNaN(s.getTime()) || s.getTime() < from || s.getTime() > to) continue;
          const allDay = ev.datetype === 'date' || inst.isFullDay;
          // all-day dates are floating: read the calendar day in local terms
          const date = allDay ? ymd(s.getFullYear(), s.getMonth() + 1, s.getDate()) : s.toISOString().slice(0, 10);
          const raw = inst.summary ?? ev.summary;
          const title = String(typeof raw === 'string' ? raw : raw?.val ?? '').trim().slice(0, 150);
          if (!title || seen.has(date + title)) continue;
          seen.add(date + title);
          items.push({ date, title });
        }
      }
      if (!items.length) throw new Error('no events');
      return items.sort((x, y) => x.date.localeCompare(y.date));
    } finally {
      clearTimeout(timer);
    }
  }

  async list(): Promise<{ source: 'google' | 'fallback'; holidays: Holiday[] }> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.cache.ttl) {
      return { source: this.cache.source, holidays: this.cache.items };
    }
    try {
      const items = await this.fromGoogle();
      this.cache = { at: now, ttl: 12 * 60 * 60 * 1000, items, source: 'google' };
    } catch (e: any) {
      this.logger.warn(`Holiday calendar unavailable, using built-in dates: ${e?.message ?? e}`);
      const y = new Date().getFullYear();
      const items = [y - 1, y, y + 1].flatMap(fallbackFor).sort((a, b) => a.date.localeCompare(b.date));
      this.cache = { at: now, ttl: 30 * 60 * 1000, items, source: 'fallback' };
    }
    return { source: this.cache.source, holidays: this.cache.items };
  }
}
