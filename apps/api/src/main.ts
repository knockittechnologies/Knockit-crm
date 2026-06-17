import 'reflect-metadata';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const isProd = config.get('app.isProd');

  // Security headers — HSTS, no-sniff, frame-deny, etc.
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // Strip/transform/validate every incoming DTO automatically.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop unknown properties instead of erroring oddly later
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CRITICAL: without this, @Exclude({ toPlainOnly: true }) on entity fields
  // (passwordHash, twoFaSecret, refreshTokenHash, etc.) does nothing — those
  // decorators only take effect when something actually runs the response
  // through class-transformer's plainToClass/classToPlain, which is exactly
  // what this interceptor does for every controller response. Found by
  // testing a real endpoint and seeing passwordHash come back in the JSON.
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: false,
    }),
  );

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: config.get('app.frontendUrl'),
    credentials: true, // required for the httpOnly refresh-token cookie
  });

  // Swagger only in non-production — don't expose API shape publicly in prod
  if (!isProd) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Knockit CRM API')
        .setDescription('CRM, Project Management, Helpdesk & Client Portal API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('app.port') || 3000;
  await app.listen(port);

  console.log(`🚀 Knockit API running on http://localhost:${port}/api`);
  console.log(`📚 Environment: ${config.get('app.env')}`);
  if (!isProd) console.log(`📖 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
