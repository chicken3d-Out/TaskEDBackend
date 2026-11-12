import { Controller, Get } from '@nestjs/common';

// Public, no database: lets an uptime monitor keep the server awake.
@Controller('health')
export class HealthController {
  @Get()
  ok() {
    return { status: 'ok' };
  }
}
