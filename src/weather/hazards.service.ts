import { Injectable } from '@nestjs/common';

export interface TyphoonPoint {
  time: string | null;
  latitude: number;
  longitude: number;
  forecast: boolean;
  windKph: number | null;
  gustKph: number | null;
  pressure: number | null;
  status: string | null;
  category: string;
}
export interface Typhoon {
  id: string;
  name: string;
  country: string | null;
  alert: string | null;
  category: string;
  windKph: number | null;
  source: string | null;
  points: TyphoonPoint[];
}
export interface Quake {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  depthKm: number;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  estimatedIntensity: number | null;
  reportedIntensity: number | null;
  url: string;
}

const GDACS = 'https://www.gdacs.org/gdacsapi/api';

// Strength labels following PAGASA's wind-speed scale (km/h).
export function category(kph: number | null): string {
  if (kph == null) return 'Unknown';
  if (kph < 62) return 'Tropical Depression';
  if (kph < 89) return 'Tropical Storm';
  if (kph < 118) return 'Severe Tropical Storm';
  if (kph < 185) return 'Typhoon';
  return 'Super Typhoon';
}

@Injectable()
export class HazardsService {
  private cache = new Map<string, { at: number; data: any }>();

  private async getJson(url: string): Promise<any> {
    const res = await fetch(url, { headers: { 'User-Agent': 'TaskEd/1.0 (DepEd Leyte)' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return res.json();
  }

  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.data;
    const data = await fn();
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  // ---- Typhoons (GDACS, built on JTWC/NOAA data) ----
  async typhoons(): Promise<{ typhoons: Typhoon[]; updated: string }> {
    return this.cached('ty', 15 * 60 * 1000, async () => {
      const to = new Date();
      const from = new Date(Date.now() - 10 * 86400000);
      const d = (x: Date) => x.toISOString().slice(0, 10);
      const list = await this.getJson(
        `${GDACS}/events/geteventlist/SEARCH?eventlist=TC&fromDate=${d(from)}&toDate=${d(to)}&alertlevel=Green;Orange;Red&pageSize=50&pageNumber=1`,
      );
      const events = (list?.features ?? []).filter((f: any) => String(f?.properties?.iscurrent).toLowerCase() === 'true');
      const out: Typhoon[] = [];
      for (const f of events) {
        try {
          const p = f.properties;
          const detail = await this.getJson(`${GDACS}/events/geteventdata?eventtype=TC&eventid=${p.eventid}`);
          const impacts = detail?.properties?.impacts ?? [];
          const url = impacts.map((i: any) => i?.resource?.timeline).find(Boolean);
          if (!url) continue;
          const tl = await this.getJson(url);
          const items: any[] = tl?.channel?.item ?? (Array.isArray(tl) ? tl : []);
          const raw = items
            .map((it) => ({
              time: it.advisory_datetime ?? null,
              latitude: Number(it.latitude),
              longitude: Number(it.longitude),
              forecast: String(it.actual).toLowerCase() === 'false',
              wind: it.wind_speed != null ? Number(it.wind_speed) : null,
              gust: it.wind_gusts != null ? Number(it.wind_gusts) : null,
              pressure: it.pressure != null ? Number(it.pressure) : null,
              status: Array.isArray(it.storm_status) ? (it.storm_status[0] ?? null) : (it.storm_status ?? null),
            }))
            .filter((x) => Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
          // GDACS timeline wind is normally knots; if values look like km/h already, keep them.
          const maxWind = Math.max(0, ...raw.map((r) => r.wind ?? 0));
          const factor = maxWind > 0 && maxWind <= 160 ? 1.852 : 1;
          const points: TyphoonPoint[] = raw.map((r) => {
            const kph = r.wind != null ? Math.round(r.wind * factor) : null;
            return {
              time: r.time,
              latitude: r.latitude,
              longitude: r.longitude,
              forecast: r.forecast,
              windKph: kph,
              gustKph: r.gust != null ? Math.round(r.gust * factor) : null,
              pressure: r.pressure,
              status: r.status,
              category: category(kph),
            };
          });
          if (!points.length) continue;
          const now = points.filter((x) => !x.forecast).pop() ?? points[0];
          out.push({
            id: String(p.eventid),
            name: p.eventname || 'Unnamed system',
            country: p.country ?? null,
            alert: p.episodealertlevel ?? p.alertlevel ?? null,
            category: now.category,
            windKph: now.windKph,
            source: p.source ?? null,
            points,
          });
        } catch {
          /* skip one broken event */
        }
      }
      return { typhoons: out, updated: new Date().toISOString() };
    });
  }

  // ---- Earthquakes (USGS) ----
  async earthquakes(lat: number | null, lon: number | null): Promise<{ quakes: Quake[]; updated: string }> {
    const data = await this.cached('eq', 5 * 60 * 1000, async () => {
      const start = new Date(Date.now() - 7 * 86400000).toISOString();
      return this.getJson(
        `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}` +
          `&minlatitude=3&maxlatitude=23&minlongitude=114&maxlongitude=130&minmagnitude=2.5&orderby=time&limit=300`,
      );
    });
    const rad = (x: number) => (x * Math.PI) / 180;
    const quakes: Quake[] = (data?.features ?? []).map((f: any) => {
      const [qLon, qLat, depth] = f.geometry.coordinates;
      const mag = Number(f.properties.mag);
      let dist: number | null = null;
      let est: number | null = null;
      if (lat != null && lon != null) {
        const a =
          Math.sin(rad(qLat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(qLat)) * Math.sin(rad(qLon - lon) / 2) ** 2;
        dist = Math.round(2 * 6371 * Math.asin(Math.sqrt(a)));
        const r = Math.max(10, Math.sqrt(dist * dist + depth * depth));
        est = Math.max(1, Math.min(10, Math.round(1.5 + 1.5 * mag - 3.3 * Math.log10(r))));
      }
      return {
        id: f.id,
        magnitude: mag,
        place: f.properties.place ?? '',
        time: new Date(f.properties.time).toISOString(),
        depthKm: Math.round(depth),
        latitude: qLat,
        longitude: qLon,
        distanceKm: dist,
        estimatedIntensity: est,
        reportedIntensity: f.properties.mmi != null ? Math.round(f.properties.mmi) : f.properties.cdi != null ? Math.round(f.properties.cdi) : null,
        url: f.properties.url,
      };
    });
    if (lat != null && lon != null) quakes.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    return { quakes: quakes.slice(0, 60), updated: new Date().toISOString() };
  }
}
