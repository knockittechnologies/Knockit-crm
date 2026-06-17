import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Contact } from './entities/contact.entity';
import { CreateContactDto, UpdateContactDto, QueryContactsDto } from './dto/contact.dto';
import { PaginatedResult, paginate } from '../../common/types/pagination';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact) private contactsRepo: Repository<Contact>,
  ) {}

  async create(
    tenantId: string,
    dto: CreateContactDto,
    createdById: string,
  ): Promise<Contact> {
    const contact = this.contactsRepo.create({
      ...dto,
      tenantId,
      createdById,
    });
    return this.contactsRepo.save(contact);
  }

  async findAll(
    tenantId: string,
    query: QueryContactsDto,
  ): Promise<PaginatedResult<Contact>> {
    const page = Math.max(parseInt(query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10), 1), 100);

    const qb = this.contactsRepo
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.company', 'company')
      .where('contact.tenantId = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere(
        '(contact.firstName ILIKE :search OR contact.lastName ILIKE :search OR contact.email ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.companyId) {
      qb.andWhere('contact.companyId = :companyId', { companyId: query.companyId });
    }

    qb.orderBy('contact.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return paginate(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<Contact> {
    const contact = await this.contactsRepo.findOne({
      where: { id, tenantId },
      relations: ['company'],
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateContactDto,
  ): Promise<Contact> {
    const contact = await this.findOne(tenantId, id);
    Object.assign(contact, dto);
    return this.contactsRepo.save(contact);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const contact = await this.findOne(tenantId, id);
    await this.contactsRepo.softRemove(contact);
  }

  /**
   * Generates an invite token for the client portal. The actual emailing
   * of this link is wired up when the Resend email integration lands —
   * for now this returns the raw token so it can be tested/used directly.
   * Mirrors AuthService's invite pattern for staff, kept deliberately
   * separate since Contact has its own auth fields, not a shared User row.
   */
  async invitePortalAccess(tenantId: string, id: string): Promise<{ inviteToken: string }> {
    const contact = await this.findOne(tenantId, id);

    if (!contact.email) {
      throw new BadRequestException('Contact must have an email address to be invited to the portal');
    }
    if (contact.isClientUser && contact.passwordHash) {
      throw new BadRequestException('This contact already has portal access');
    }

    const inviteToken = randomBytes(32).toString('hex');
    const inviteTokenExpiresAt = new Date();
    inviteTokenExpiresAt.setDate(inviteTokenExpiresAt.getDate() + 7); // 7-day expiry, matches staff invite pattern

    contact.inviteToken = inviteToken;
    contact.inviteTokenExpiresAt = inviteTokenExpiresAt;
    await this.contactsRepo.save(contact);

    return { inviteToken };
  }
}
