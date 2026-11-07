import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HrProfile } from './hr-profile.entity';
import { User } from '../users/user.entity';
import { HrProfileService } from './hr-profile.service';
import { HrProfileController } from './hr-profile.controller';

@Module({
  imports: [TypeOrmModule.forFeature([HrProfile, User])],
  controllers: [HrProfileController],
  providers: [HrProfileService],
})
export class HrProfileModule {}
