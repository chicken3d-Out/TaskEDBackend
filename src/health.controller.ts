import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  // Public, no database: lets an uptime monitor keep the server awake.
  @Get()
  ok() {
    return { status: 'ok' };
  }

  // Public, runs one tiny query: keeps a serverless database (Neon) awake
  // while a scheduler calls it, and reports a real error if the database
  // cannot be reached. Point a work-hours scheduler at this one.
  @Get('db')
  async db() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'unreachable' });
    }
  }
}
