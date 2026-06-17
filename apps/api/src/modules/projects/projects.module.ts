import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { Task } from './entities/task.entity';
import { Milestone } from './entities/milestone.entity';
import { TimeLog } from './entities/timelog.entity';
import { Role } from '../roles/entities/role.entity';
import { ProjectsService } from './projects.service';
import { TasksService } from './tasks.service';
import { MilestonesService } from './milestones.service';
import { TimeLogsService } from './timelogs.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Task, Milestone, TimeLog, Role])],
  providers: [ProjectsService, TasksService, MilestonesService, TimeLogsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
