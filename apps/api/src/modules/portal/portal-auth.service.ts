import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';

import { Contact } from '../contacts/entities/contact.entity';
import { PortalSession } from './entities/portal-session.entity';
import { PortalLoginDto, PortalAcceptInviteDto } from './dto/portal-auth.dto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface PortalJwtPayload {
  sub: string; // contact id
  tenantId: string;
  companyId: string | null;
  scope: 'portal'; // distinguishes this token from a staff JWT at validation time
}

@Injectable()
export class PortalAuthService {
  constructor(
    @InjectRepository(Contact) private contactsRepo: Repository<Contact>,
    @InjectRepository(PortalSession)
    private sessionsRepo: Repository<PortalSession>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: PortalLoginDto, meta: RequestMeta) {
    const contact = await this.contactsRepo.findOne({
      where: { email: dto.email.toLowerCase(), isClientUser: true },
    });

    // Same generic error whether the contact doesn't exist, isn't a portal
    // user, or the password is wrong — don't leak which emails exist.
    if (!contact || !contact.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const validPassword = await argon2.verify(contact.passwordHash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    contact.lastPortalLoginAt = new Date();
    await this.contactsRepo.save(contact);

    const tokens = await this.issueTokenPair(contact, meta);
    return { contact: this.sanitiseContact(contact), ...tokens };
  }

  async acceptInvite(dto: PortalAcceptInviteDto, meta: RequestMeta) {
    const contact = await this.contactsRepo.findOne({
      where: { inviteToken: dto.token },
    });

    if (
      !contact ||
      !contact.inviteTokenExpiresAt ||
      contact.inviteTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('This invite link is invalid or has expired');
    }

    contact.passwordHash = await argon2.hash(dto.password);
    contact.isClientUser = true;
    contact.inviteToken = null;
    contact.inviteTokenExpiresAt = null;
    await this.contactsRepo.save(contact);

    const tokens = await this.issueTokenPair(contact, meta);
    return { contact: this.sanitiseContact(contact), ...tokens };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const [sessionId, raw] = refreshToken.split('.');
    if (!sessionId || !raw) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId },
      relations: ['contact'],
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== this.hashToken(raw)
    ) {
      throw new UnauthorizedException('Session expired or revoked — please log in again');
    }

    session.revokedAt = new Date();
    await this.sessionsRepo.save(session);

    return this.issueTokenPair(session.contact, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    const [sessionId] = refreshToken.split('.');
    if (!sessionId) return;
    await this.sessionsRepo.update({ id: sessionId }, { revokedAt: new Date() });
  }

  private async issueTokenPair(contact: Contact, meta: RequestMeta): Promise<TokenPair> {
    const payload: PortalJwtPayload = {
      sub: contact.id,
      tenantId: contact.tenantId,
      companyId: contact.companyId,
      scope: 'portal',
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.accessSecret'),
      expiresIn: this.configService.get('jwt.accessExpiry'),
    });

    const refreshTokenRaw = randomBytes(48).toString('hex');
    const refreshTokenHash = this.hashToken(refreshTokenRaw);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = this.sessionsRepo.create({
      contactId: contact.id,
      refreshTokenHash,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    await this.sessionsRepo.save(session);

    const refreshToken = `${session.id}.${refreshTokenRaw}`;
    return { accessToken, refreshToken };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private sanitiseContact(contact: Contact) {
    const { passwordHash: _passwordHash, inviteToken: _inviteToken, ...safe } = contact;
    return safe;
  }
}
