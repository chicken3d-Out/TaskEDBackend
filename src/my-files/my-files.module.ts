import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalFile } from './personal-file.entity';
import { MyFilesService } from './my-files.service';
import { MyFilesController } from './my-files.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PersonalFile])],
  controllers: [MyFilesController],
  providers: [MyFilesService],
})
export class MyFilesModule {}
