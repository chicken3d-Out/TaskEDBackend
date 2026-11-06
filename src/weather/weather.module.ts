import { Module } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { HazardsService } from './hazards.service';
import { WeatherController } from './weather.controller';

@Module({
  controllers: [WeatherController],
  providers: [WeatherService, HazardsService],
})
export class WeatherModule {}
