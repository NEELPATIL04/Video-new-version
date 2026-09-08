import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());

  // Explicit allowlist, never '*' — credentials:true (needed for the
  // httpOnly refresh cookie) is rejected outright by browsers if the
  // origin is a wildcard, so this also isn't optional for cookies to work.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    credentials: true,
  });

  // whitelist strips any field not declared on the DTO (e.g. a client
  // trying to set `role` on their own registration payload);
  // forbidNonWhitelisted turns that into a hard 400 instead of silently
  // dropping it, so bad client behavior is visible during development.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(config.get<number>('PORT', 3001));
}
bootstrap();
