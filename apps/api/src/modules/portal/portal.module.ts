import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Contact } from '../contacts/entities/contact.entity';
import { PortalSession } from './entities/portal-session.entity';
import { Approval } from './entities/approval.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketComment } from '../tickets/entities/ticket-comment.entity';
import { Project } from '../projects/entities/project.entity';
import { TicketsModule } from '../tickets/tickets.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { AmcModule } from '../amc/amc.module';

import { PortalAuthService } from './portal-auth.service';
import { PortalAuthController } from './portal-auth.controller';
import { PortalJwtStrategy } from './strategies/portal-jwt.strategy';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, PortalSession, Approval, Ticket, TicketComment, Project]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.accessSecret'),
        signOptions: { expiresIn: config.get('jwt.accessExpiry') },
      }),
    }),
    TicketsModule,
    KnowledgeBaseModule,
    AmcModule,
  ],
  providers: [PortalAuthService, PortalJwtStrategy, PortalService],
  controllers: [PortalAuthController, PortalController],
})
export class PortalModule {}
