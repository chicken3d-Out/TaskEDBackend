import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // the signed Travel Authority (Word file) is sent as base64, so allow bigger JSON bodies
  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { limit: '12mb', extended: true });
  const config = app.get(ConfigService);

  // Allowed browser origins: the web app (FRONTEND_URL; several can be given,
  // separated by commas) plus the origins the Capacitor Android/iOS app sends
  // requests from. Requests with no Origin (server-to-server, curl) pass too.
  const webOrigins = config
    .get<string>('FRONTEND_URL', 'http://localhost:4200')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const appOrigins = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost'];
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const o = origin.replace(/\/+$/, '');
      cb(null, webOrigins.includes(o) || appOrigins.includes(o));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  console.log(`TaskEd backend listening on http://localhost:${port}`);
}
bootstrap();
