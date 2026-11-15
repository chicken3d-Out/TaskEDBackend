import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Keeps a serverless database (Neon free plan) awake while people work.
// Every 4 minutes, every day, 8:00-16:59 Philippine time, it runs one tiny
// query. Outside those hours the database is allowed to sleep, which keeps
// the monthly compute hours under the free limit.
// Needs the backend itself to be awake (UptimeRobot on /health does that).
// Set DB_KEEPALIVE=off to turn it off.
@Injectable()
export class DbKeepAliveService {
  private readonly log = new Logger('DbKeepAlive');

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  @Cron('0 */4 8-16 * * *', { timeZone: 'Asia/Manila' })
  async ping() {
    if ((process.env.DB_KEEPALIVE || '').toLowerCase() === 'off') return;
    try {
      await this.dataSource.query('SELECT 1');
    } catch (e: any) {
      this.log.warn(`keep-alive query failed: ${e?.message ?? e}`);
    }
  }
}
