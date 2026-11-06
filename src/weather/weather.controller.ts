import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { WeatherService } from './weather.service';
import { HazardsService } from './hazards.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('weather')
export class WeatherController {
  constructor(
    private weatherService: WeatherService,
    private hazards: HazardsService,
  ) {}

  @Get('typhoons')
  typhoons() {
    return this.hazards.typhoons().catch(() => ({ typhoons: [], updated: new Date().toISOString(), error: true }));
  }

  @Get('earthquakes')
  earthquakes(@Query('lat') lat?: string, @Query('lon') lon?: string) {
    const la = lat != null ? parseFloat(lat) : NaN;
    const lo = lon != null ? parseFloat(lon) : NaN;
    return this.hazards
      .earthquakes(Number.isFinite(la) ? la : null, Number.isFinite(lo) ? lo : null)
      .catch(() => ({ quakes: [], updated: new Date().toISOString(), error: true }));
  }

  @Get('search')
  search(@Query('q') q: string) {
    return this.weatherService.search(q);
  }

  @Get()
  getForecast(@Query('lat') lat: string, @Query('lon') lon: string) {
    return this.weatherService.getForecast(parseFloat(lat), parseFloat(lon));
  }
}
