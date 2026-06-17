import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * This file is used ONLY by the TypeORM CLI (migration:generate, migration:run).
 * The running NestJS app gets its connection via DatabaseModule (database.module.ts)
 * instead — keep both in sync if you change connection options.
 *
 * IMPORTANT: this file is loaded two different ways depending on context:
 *   - In development, via `migration:run` (ts-node-commonjs), so __filename
 *     ends in .ts and entities/migrations must be globbed as .ts files.
 *   - In production, via `migration:run:prod` against the COMPILED
 *     dist/database/data-source.js, so __filename ends in .js and the glob
 *     must point at the compiled .js migration/entity files instead — they
 *     don't exist as .ts in the production image at all (see Dockerfile,
 *     which only copies dist/, not src/).
 * Without this branch, the production migration task fails outright trying
 * to load TypeScript source through plain Node, which doesn't understand
 * TypeScript syntax.
 */
const isCompiled = __filename.endsWith('.js');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [
    isCompiled ? 'dist/modules/**/entities/*.entity.js' : 'src/modules/**/entities/*.entity.ts',
  ],
  migrations: [
    isCompiled ? 'dist/database/migrations/*.js' : 'src/database/migrations/*.ts',
  ],
  synchronize: false, // NEVER true — migrations only, even in dev
  logging: process.env.NODE_ENV === 'development',
});
