import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherFile } from './teacher-file.entity';
import { User } from '../users/user.entity';
import { TeacherFilesService } from './teacher-files.service';
import { TeacherFilesController } from './teacher-files.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherFile, User])],
  controllers: [TeacherFilesController],
  providers: [TeacherFilesService],
})
export class TeacherFilesModule {}
