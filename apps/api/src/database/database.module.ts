import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        ssl: config.get('database.ssl'),
        autoLoadEntities: true,
        // synchronize is ALWAYS false — schema changes go through migrations only,
        // in every environment including local dev. This is what keeps dev/staging/prod
        // schemas guaranteed identical.
        synchronize: false,
        logging: config.get('app.isDev') ? ['error', 'warn'] : ['error'],
        maxQueryExecutionTime: 1000, // logs slow queries over 1s
      }),
    }),
  ],
})
export class DatabaseModule {}
