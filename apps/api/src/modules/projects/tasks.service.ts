import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Task, TaskStatus } from './entities/task.entity';
import { CreateTaskDto, UpdateTaskDto, QueryTasksDto } from './dto/project.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private tasksRepo: Repository<Task>,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    projectId: string,
    dto: CreateTaskDto,
    createdById: string,
  ): Promise<Task> {
    const task = this.tasksRepo.create({ ...dto, tenantId, projectId, createdById });
    return this.tasksRepo.save(task);
  }

  async findAllForProject(
    tenantId: string,
    projectId: string,
    query: QueryTasksDto,
  ): Promise<Task[]> {
    const where: Record<string, unknown> = { tenantId, projectId };
    if (query.status) where.status = query.status;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.milestoneId) where.milestoneId = query.milestoneId;

    return this.tasksRepo.find({
      where,
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      relations: ['assignedTo'],
    });
  }

  async findOne(tenantId: string, id: string): Promise<Task> {
    const task = await this.tasksRepo.findOne({ where: { id, tenantId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  async update(tenantId: string, id: string, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(tenantId, id);
    Object.assign(task, dto);
    return this.tasksRepo.save(task);
  }

  async changeStatus(tenantId: string, id: string, status: TaskStatus): Promise<Task> {
    const task = await this.findOne(tenantId, id);
    const previousStatus = task.status;
    task.status = status;
    task.completedAt = status === TaskStatus.DONE ? new Date() : null;

    const saved = await this.tasksRepo.save(task);
    this.eventEmitter.emit('task.status_changed', {
      tenantId,
      task: saved,
      previousStatus,
    });
    return saved;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const task = await this.findOne(tenantId, id);
    await this.tasksRepo.softRemove(task);
  }
}
