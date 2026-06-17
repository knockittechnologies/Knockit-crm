import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ProjectStatus, ProjectType } from '../entities/project.entity';
import { TaskStatus, TaskPriority } from '../entities/task.entity';
import { MilestoneStatus } from '../entities/milestone.entity';

// ───────────────────────── Projects ─────────────────────────

export class CreateProjectDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  targetEndDate?: string;

  @IsOptional()
  @IsNumberString()
  budget?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  teamMemberIds?: string[];
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class ChangeProjectStatusDto {
  @IsEnum(ProjectStatus)
  status: ProjectStatus;
}

export class QueryProjectsDto {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsUUID()
  companyId?: string;

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

// ───────────────────────── Milestones ─────────────────────────

export class CreateMilestoneDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

export class ChangeMilestoneStatusDto {
  @IsEnum(MilestoneStatus)
  status: MilestoneStatus;
}

// ───────────────────────── Tasks ─────────────────────────

export class CreateTaskDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsNumberString()
  estimatedHours?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}

export class QueryTasksDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  milestoneId?: string;
}

// ───────────────────────── Time Logs ─────────────────────────

export class CreateTimeLogDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsDateString()
  date: string;

  @IsNumberString()
  hours: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  isAmcHours?: boolean;

  @IsOptional()
  isBillable?: boolean;
}
