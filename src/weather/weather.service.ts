import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';

export interface WeatherBucket {
  startTime: string;
  endTime: string;
  temperature: number | null;
  precipitationProbability: number | null;
}

export interface WeatherForecast {
  location: { latitude: number; longitude: number };
  current: { temperature: number | null; precipitationProbability: number | null };
  hourlyBuckets: WeatherBucket[]; // 2-hour increments, per spec
}

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; precipitation_probability?: number };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
  };
}

const BUCKET_HOURS = 2;
const BUCKET_COUNT = 6; // next 12 hours

@Injectable()
export class WeatherService {
  // Open-Meteo requires no API key, which keeps this simple - swap the
  // base URL here if the division standardizes on a different provider
  // (PAGASA-backed source, a paid API, etc.) later.
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast';

  async getForecast(latitude: number, longitude: number): Promise<WeatherForecast> {
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new BadRequestException('latitude and longitude must be numbers');
    }

    const url =
      `${this.baseUrl}?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,precipitation_probability` +
      `&hourly=temperature_2m,precipitation_probability` +
      `&forecast_days=1&timezone=auto`;

    let data: OpenMeteoResponse;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Upstream weather API returned ${res.status}`);
      data = (await res.json()) as OpenMeteoResponse;
    } catch (err) {
      throw new BadGatewayException('Could not reach the weather service');
    }

    const hourlyBuckets: WeatherBucket[] = [];
    const times = data.hourly?.time ?? [];
    const temps = data.hourly?.temperature_2m ?? [];
    const rain = data.hourly?.precipitation_probability ?? [];

    // Find the first index at/after "now" so buckets start from the
    // current hour rather than midnight.
    const now = Date.now();
    let startIdx = times.findIndex((t) => new Date(t).getTime() >= now);
    if (startIdx === -1) startIdx = 0;

    for (let b = 0; b < BUCKET_COUNT; b++) {
      const i0 = startIdx + b * BUCKET_HOURS;
      const i1 = i0 + BUCKET_HOURS - 1;
      if (i1 >= times.length) break;

      const bucketRain = [rain[i0], rain[i1]].filter((v) => v !== undefined) as number[];
      const bucketTemp = [temps[i0], temps[i1]].filter((v) => v !== undefined) as number[];

      hourlyBuckets.push({
        startTime: times[i0],
        endTime: times[i1],
        // "chance of rain" for the window - take the higher of the two
        // hourly readings rather than averaging, since the risk that
        // matters is the peak, not the mean.
        precipitationProbability: bucketRain.length ? Math.max(...bucketRain) : null,
        temperature: bucketTemp.length ? bucketTemp[0] : null,
      });
    }

    return {
      location: { latitude, longitude },
      current: {
        temperature: data.current?.temperature_2m ?? null,
        precipitationProbability: data.current?.precipitation_probability ?? null,
      },
      hourlyBuckets,
    };
  }
}
