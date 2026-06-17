import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmcContract } from './entities/amc-contract.entity';
import { TimeLog } from '../projects/entities/timelog.entity';
import { AmcService } from './amc.service';
import { AmcController } from './amc.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AmcContract, TimeLog])],
  providers: [AmcService],
  controllers: [AmcController],
  exports: [AmcService],
})
export class AmcModule {}
