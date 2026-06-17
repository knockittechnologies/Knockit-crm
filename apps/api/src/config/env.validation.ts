import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  Max,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

/**
 * Every environment variable the API needs, in one place.
 * If anything required is missing or malformed, the app refuses to boot
 * — this catches misconfiguration at startup rather than at 3am in prod.
 */
class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  // Database
  @IsString()
  DB_HOST: string;

  @IsInt()
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_DATABASE: string;

  @IsOptional()
  @IsString()
  DB_SSL?: string;

  // Redis
  @IsString()
  REDIS_HOST: string;

  @IsInt()
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // Auth
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRY?: string; // e.g. "15m"

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRY?: string; // e.g. "30d"

  // CORS / frontend
  @IsUrl({ require_tld: false })
  FRONTEND_URL: string;

  // Email (Resend)
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  // File storage (S3-compatible)
  @IsOptional()
  @IsString()
  AWS_REGION?: string;

  @IsOptional()
  @IsString()
  AWS_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET?: string;

  // Pusher (real-time)
  @IsOptional()
  @IsString()
  PUSHER_APP_ID?: string;

  @IsOptional()
  @IsString()
  PUSHER_KEY?: string;

  @IsOptional()
  @IsString()
  PUSHER_SECRET?: string;

  @IsOptional()
  @IsString()
  PUSHER_CLUSTER?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints || {}).join(', ')}`)
      .join('\n');
    throw new Error(
      `\n❌ Invalid environment configuration. Fix .env and restart:\n${messages}\n`,
    );
  }
  return validated;
}
