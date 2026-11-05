import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';

export interface WeatherHour {
  time: string; // local time, e.g. 2026-11-05T14:00
  temperature: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  precipitation: number | null; // mm
  code: number | null;
}

export interface WeatherDay {
  date: string; // YYYY-MM-DD
  tempMax: number | null;
  tempMin: number | null;
  precipitationProbabilityMax: number | null;
  code: number | null;
  hours: WeatherHour[];
}

export interface WeatherForecast {
  location: { latitude: number; longitude: number; name: string | null };
  current: {
    temperature: number | null;
    feelsLike: number | null;
    humidity: number | null;
    precipitationProbability: number | null;
    code: number | null;
    time: string | null;
  };
  days: WeatherDay[]; // today first
}

export interface PlaceResult {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

@Injectable()
export class WeatherService {
  // Open-Meteo needs no API key.
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast';

  private async getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
    return res.json();
  }

  // Best-effort town name for the coordinates (never fails the forecast).
  private async placeName(lat: number, lon: number): Promise<string | null> {
    try {
      const d = await this.getJson(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lon}`,
        { 'User-Agent': 'TaskEd/1.0 (DepEd Leyte)', 'Accept-Language': 'en' },
      );
      const a = d?.address ?? {};
      const parts = [a.suburb || a.village || a.neighbourhood, a.municipality || a.city || a.town, a.state || a.province]
        .filter(Boolean);
      return parts.length ? [...new Set(parts)].join(', ') : (d?.display_name ?? null);
    } catch {
      return null;
    }
  }

  async search(q: string): Promise<PlaceResult[]> {
    const query = (q ?? '').trim();
    if (query.length < 2) throw new BadRequestException('Type at least 2 letters.');
    try {
      const d = await this.getJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json&countryCode=PH`,
      );
      return (d?.results ?? []).map((r: any) => ({
        name: r.name,
        detail: [r.admin2, r.admin1].filter(Boolean).join(', '),
        latitude: r.latitude,
        longitude: r.longitude,
      }));
    } catch {
      throw new BadGatewayException('Could not search places right now');
    }
  }

  async getForecast(latitude: number, longitude: number): Promise<WeatherForecast> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new BadRequestException('latitude and longitude must be valid numbers');
    }
    const hourlyVars = 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code';
    const url =
      `${this.baseUrl}?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,weather_code` +
      `&hourly=${hourlyVars}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
      `&forecast_days=7&timezone=auto`;

    let data: any;
    try {
      data = await this.getJson(url);
    } catch {
      throw new BadGatewayException('Could not reach the weather service');
    }

    const h = data.hourly ?? {};
    const times: string[] = h.time ?? [];
    const days: WeatherDay[] = (data.daily?.time ?? []).map((date: string, di: number) => ({
      date,
      tempMax: data.daily.temperature_2m_max?.[di] ?? null,
      tempMin: data.daily.temperature_2m_min?.[di] ?? null,
      precipitationProbabilityMax: data.daily.precipitation_probability_max?.[di] ?? null,
      code: data.daily.weather_code?.[di] ?? null,
      hours: [],
    }));
    const byDate = new Map(days.map((d) => [d.date, d]));
    times.forEach((t, i) => {
      const day = byDate.get(t.slice(0, 10));
      if (!day) return;
      day.hours.push({
        time: t,
        temperature: h.temperature_2m?.[i] ?? null,
        humidity: h.relative_humidity_2m?.[i] ?? null,
        precipitationProbability: h.precipitation_probability?.[i] ?? null,
        precipitation: h.precipitation?.[i] ?? null,
        code: h.weather_code?.[i] ?? null,
      });
    });

    const c = data.current ?? {};
    return {
      location: { latitude, longitude, name: await this.placeName(latitude, longitude) },
      current: {
        temperature: c.temperature_2m ?? null,
        feelsLike: c.apparent_temperature ?? null,
        humidity: c.relative_humidity_2m ?? null,
        precipitationProbability: c.precipitation_probability ?? null,
        code: c.weather_code ?? null,
        time: c.time ?? null,
      },
      days,
    };
  }
}
