import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApprovedGuard } from '../common/guards/approved.guard';
import { WeatherService } from './weather.service';

@UseGuards(JwtAuthGuard, ApprovedGuard)
@Controller('weather')
export class WeatherController {
  constructor(private weatherService: WeatherService) {}

  @Get()
  getForecast(@Query('lat') lat: string, @Query('lon') lon: string) {
    return this.weatherService.getForecast(parseFloat(lat), parseFloat(lon));
  }
}
