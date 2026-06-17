import { registerAs } from '@nestjs/config';

/**
 * Namespaced config objects. Inject via ConfigService.get('app.port') etc.
 * Keeping these as factories (not raw process.env reads scattered everywhere)
 * means every environment variable has exactly one place it's read from.
 */

export const appConfig = registerAs('app', () => ({
  env: process.env.NODE_ENV,
  port: parseInt(process.env.PORT || '3000', 10),
  frontendUrl: process.env.FRONTEND_URL,
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',
  isStaging: process.env.NODE_ENV === 'staging',
}));

export const databaseConfig = registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
}));

export const jwtConfig = registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
  refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '30d',
}));

export const emailConfig = registerAs('email', () => ({
  resendApiKey: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM || 'Knockit Technologies <noreply@knockit.co.uk>',
}));

export const storageConfig = registerAs('storage', () => ({
  region: process.env.AWS_REGION || 'eu-west-2', // London region by default (UK)
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  bucket: process.env.S3_BUCKET,
}));

export const pusherConfig = registerAs('pusher', () => ({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER || 'eu',
}));
