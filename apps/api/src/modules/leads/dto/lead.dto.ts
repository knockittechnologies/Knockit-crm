import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { LeadPriority, LeadStatus } from '../entities/lead.entity';
import { LeadActivityType } from '../entities/lead-activity.entity';

export class CreateLeadDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(LeadPriority)
  priority?: LeadPriority;

  @IsOptional()
  @IsNumberString()
  estimatedValue?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsDateString()
  expectedClose?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceType?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {}

/**
 * Separate from UpdateLeadDto because changing status is a meaningful
 * business event (triggers activity log + notification + the
 * LEAD_STATUS_TRANSITIONS validation) rather than an incidental field edit.
 */
export class ChangeLeadStatusDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;

  // Required when moving to 'lost' — this is what makes "capture lost reason"
  // from the lead flow design an enforced rule, not just a UI suggestion.
  @ValidateIf((o) => o.status === LeadStatus.LOST)
  @IsString()
  @MaxLength(1000)
  lostReason?: string;
}

export class QueryLeadsDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreateLeadActivityDto {
  @IsEnum(LeadActivityType)
  type: LeadActivityType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class CreateLeadFollowUpDto {
  @IsUUID()
  assignedToId: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
