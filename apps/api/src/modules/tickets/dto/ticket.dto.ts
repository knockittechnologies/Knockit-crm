import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { TicketPriority, TicketSource } from '../entities/ticket.entity';

export class CreateTicketDto {
  @IsString()
  @MaxLength(255)
  subject: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TicketSource)
  source?: TicketSource;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  raisedByContactId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateTicketDto extends PartialType(CreateTicketDto) {}

export class AssignTicketDto {
  @IsUUID()
  assignedToId: string;
}

export class ChangeTicketStatusDto {
  @IsEnum(['open', 'assigned', 'in_progress', 'waiting_on_client', 'resolved', 'closed', 'reopened'])
  status: string;
}

export class CreateTicketCommentDto {
  @IsString()
  body: string;

  @IsOptional()
  isInternal?: boolean;
}

export class QueryTicketsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

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
