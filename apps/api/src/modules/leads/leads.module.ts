import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './entities/lead.entity';
import { LeadActivity } from './entities/lead-activity.entity';
import { LeadFollowUp } from './entities/lead-followup.entity';
import { Role } from '../roles/entities/role.entity';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadActivity, LeadFollowUp, Role]),
  ],
  providers: [LeadsService],
  controllers: [LeadsController],
  exports: [LeadsService],
})
export class LeadsModule {}
