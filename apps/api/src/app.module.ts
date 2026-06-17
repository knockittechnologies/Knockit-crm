import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  emailConfig,
  storageConfig,
  pusherConfig,
} from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacModule } from './common/rbac/rbac.module';

import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { LeadsModule } from './modules/leads/leads.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { PortalModule } from './modules/portal/portal.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { AmcModule } from './modules/amc/amc.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        emailConfig,
        storageConfig,
        pusherConfig,
      ],
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }], // 100 req/min default, tighter on auth routes
    }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    RbacModule,
    AuthModule,
    CompaniesModule,
    ContactsModule,
    LeadsModule,
    TicketsModule,
    ProjectsModule,
    PortalModule,
    KnowledgeBaseModule,
    AmcModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
