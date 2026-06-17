import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KbCategory } from './entities/kb-category.entity';
import { Article } from './entities/article.entity';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseController } from './knowledge-base.controller';

@Module({
  imports: [TypeOrmModule.forFeature([KbCategory, Article])],
  providers: [KnowledgeBaseService],
  controllers: [KnowledgeBaseController],
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
