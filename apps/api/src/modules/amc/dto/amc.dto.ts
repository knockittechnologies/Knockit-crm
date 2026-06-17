import {
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { AmcRenewalCycle } from '../entities/amc-contract.entity';

export class CreateAmcContractDto {
  @IsUUID()
  companyId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(AmcRenewalCycle)
  renewalCycle?: AmcRenewalCycle;

  @IsDateString()
  startDate: string;

  @IsDateString()
  currentPeriodEnd: string;

  @IsNumberString()
  hoursIncludedPerPeriod: string;

  @IsOptional()
  @IsNumberString()
  overageRate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  accountManagerId?: string;
}

export class UpdateAmcContractDto extends PartialType(CreateAmcContractDto) {}

export class RenewAmcContractDto {
  @IsDateString()
  newPeriodEnd: string;
}
