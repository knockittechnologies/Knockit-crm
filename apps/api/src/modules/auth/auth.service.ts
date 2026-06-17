import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { randomBytes, createHash } from 'crypto';

import { User, UserStatus } from '../users/entities/user.entity';
import { UserSession } from './entities/user-session.entity';
import { Tenant, TenantPlan, TenantStatus } from '../tenants/entities/tenant.entity';
import { Role, SystemRoleSlug } from '../roles/entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { ROLE_PERMISSION_MAP } from '../../database/seeds/permissions.data';
import {
  LoginDto,
  RegisterTenantDto,
  EnableTwoFaDto,
  AcceptInviteDto,
} from './dto/auth.dto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Discriminated union on `requiresTwoFa`. TypeScript can narrow this
 * correctly in the controller via `if (result.requiresTwoFa)`, which is
 * what makes the wrong-property-access bug (e.g. reading `.user` off the
 * 2FA-pending branch) a compile error instead of a runtime crash.
 */
export type LoginResult = LoginRequiresTwoFa | LoginSuccess;

export interface LoginRequiresTwoFa {
  requiresTwoFa: true;
  userId: string;
}

export interface LoginSuccess extends TokenPair {
  requiresTwoFa: false;
  user: Record<string, unknown>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(Tenant) private tenantsRepo: Repository<Tenant>,
    @InjectRepository(Role) private rolesRepo: Repository<Role>,
    @InjectRepository(Permission) private permissionsRepo: Repository<Permission>,
    @InjectRepository(UserSession)
    private sessionsRepo: Repository<UserSession>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ───────────────────────── REGISTRATION (first signup) ─────────────────────────

  async registerTenant(dto: RegisterTenantDto, meta: RequestMeta) {
    const existing = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const slug = this.slugify(dto.companyName);

    const tenant = this.tenantsRepo.create({
      name: dto.companyName,
      slug,
      plan: TenantPlan.STARTER,
      status: TenantStatus.ACTIVE,
      currency: 'GBP',
      timezone: 'Europe/London',
    });
    await this.tenantsRepo.save(tenant);

    // Create the 5 system roles AND wire their permissions in the same flow.
    // This used to rely on a separate seed script running afterward, which
    // meant any tenant created via the live API ended up with roles that had
    // zero permissions until someone remembered to re-run the seed. Doing it
    // inline here means a tenant is never in a half-configured state.
    const allPermissions = await this.permissionsRepo.find();
    const permissionsBySlug = new Map(allPermissions.map((p) => [p.slug, p]));

    const superAdminRole = await this.createSystemRoleWithPermissions(
      tenant.id,
      SystemRoleSlug.SUPER_ADMIN,
      'Super Admin',
      allPermissions, // super-admin gets every permission, no filtering needed
    );

    for (const [slugKey, label] of [
      [SystemRoleSlug.ADMIN, 'Admin'],
      [SystemRoleSlug.MANAGER, 'Manager'],
      [SystemRoleSlug.STAFF, 'Staff'],
      [SystemRoleSlug.CLIENT, 'Client'],
    ] as const) {
      const permSlugs = ROLE_PERMISSION_MAP[slugKey] || [];
      const rolePermissions = permSlugs
        .map((s) => permissionsBySlug.get(s))
        .filter((p): p is Permission => Boolean(p));
      await this.createSystemRoleWithPermissions(tenant.id, slugKey, label, rolePermissions);
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = this.usersRepo.create({
      tenantId: tenant.id,
      roleId: superAdminRole.id,
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      status: UserStatus.ACTIVE,
      emailVerified: false, // a verification email flow would flip this
    });
    await this.usersRepo.save(user);

    const tokens = await this.issueTokenPair(user, meta);
    return { user: this.sanitiseUser(user), ...tokens };
  }

  private async createSystemRoleWithPermissions(
    tenantId: string,
    slug: string,
    name: string,
    permissions: Permission[],
  ) {
    const role = this.rolesRepo.create({
      tenantId,
      slug,
      name,
      isSystem: true,
      permissions,
    });
    return this.rolesRepo.save(role);
  }

  private slugify(input: string): string {
    const base = input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${base}-${randomBytes(3).toString('hex')}`;
  }

  // ───────────────────────────────── LOGIN ─────────────────────────────────

  async login(dto: LoginDto, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.usersRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['role'],
    });

    // Same error for "no such user" and "wrong password" — don't leak
    // which emails exist in the system.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('This account has been suspended. Contact your administrator.');
    }
    if (user.status === UserStatus.INVITED) {
      throw new UnauthorizedException('Please accept your invite email before logging in.');
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.twoFaEnabled) {
      if (!dto.totpCode) {
        // Signal to the frontend: password was correct, now show the OTP screen.
        return { requiresTwoFa: true, userId: user.id };
      }
      const validTotp = speakeasy.totp.verify({
        secret: user.twoFaSecret!,
        encoding: 'base32',
        token: dto.totpCode,
        window: 1, // allows the code from 30s before/after for clock drift
      });
      if (!validTotp) {
        throw new UnauthorizedException('Invalid authentication code');
      }
    }

    user.lastLoginAt = new Date();
    await this.usersRepo.save(user);

    const tokens = await this.issueTokenPair(user, meta);
    return { user: this.sanitiseUser(user), ...tokens, requiresTwoFa: false };
  }

  // ──────────────────────────── TOKEN ISSUE / REFRESH ────────────────────────────

  private async issueTokenPair(user: User, meta: RequestMeta): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      roleId: user.roleId,
      roleSlug: user.role?.slug,
      scope: 'staff' as const,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.accessSecret'),
      expiresIn: this.configService.get('jwt.accessExpiry'),
    });

    const refreshTokenRaw = randomBytes(48).toString('hex');
    const refreshTokenHash = this.hashToken(refreshTokenRaw);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // matches JWT_REFRESH_EXPIRY=30d

    const session = this.sessionsRepo.create({
      userId: user.id,
      refreshTokenHash,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    await this.sessionsRepo.save(session);

    // The refresh token the client stores combines the session id + raw secret,
    // so refresh lookups are an indexed equality check, not a full table hash scan.
    const refreshToken = `${session.id}.${refreshTokenRaw}`;

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const [sessionId, raw] = refreshToken.split('.');
    if (!sessionId || !raw) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.sessionsRepo.findOne({
      where: { id: sessionId },
      relations: ['user', 'user.role'],
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== this.hashToken(raw)
    ) {
      throw new UnauthorizedException('Session expired or revoked — please log in again');
    }

    // Rotate: revoke the old session, issue a brand new pair.
    session.revokedAt = new Date();
    await this.sessionsRepo.save(session);

    return this.issueTokenPair(session.user, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    const [sessionId] = refreshToken.split('.');
    if (!sessionId) return;
    await this.sessionsRepo.update({ id: sessionId }, { revokedAt: new Date() });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await this.sessionsRepo.update(
      { userId, revokedAt: undefined },
      { revokedAt: new Date() },
    );
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  // ────────────────────────────────── MFA (TOTP) ──────────────────────────────────

  async generateTwoFaSecret(userId: string) {
    const user = await this.usersRepo.findOneOrFail({ where: { id: userId } });

    const secret = speakeasy.generateSecret({
      name: `Knockit CRM (${user.email})`,
      length: 20,
    });

    // Stored but NOT activated yet — twoFaEnabled flips true only after
    // the user proves they scanned it correctly via enableTwoFa() below.
    user.twoFaSecret = secret.base32;
    await this.usersRepo.save(user);

    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);
    return { secret: secret.base32, qrCodeDataUrl };
  }

  async enableTwoFa(userId: string, dto: EnableTwoFaDto) {
    const user = await this.usersRepo.findOneOrFail({ where: { id: userId } });
    if (!user.twoFaSecret) {
      throw new BadRequestException('Call generate-secret first');
    }

    const valid = speakeasy.totp.verify({
      secret: user.twoFaSecret,
      encoding: 'base32',
      token: dto.totpCode,
      window: 1,
    });
    if (!valid) {
      throw new BadRequestException('Incorrect code — check your authenticator app and try again');
    }

    const backupCodes = Array.from({ length: 8 }, () =>
      randomBytes(5).toString('hex'),
    );
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((c) => argon2.hash(c)),
    );

    user.twoFaEnabled = true;
    user.twoFaBackupCodes = hashedBackupCodes;
    await this.usersRepo.save(user);

    // Raw backup codes are shown to the user ONCE, here, then never again.
    return { backupCodes };
  }

  async disableTwoFa(userId: string) {
    await this.usersRepo.update(userId, {
      twoFaEnabled: false,
      twoFaSecret: null,
      twoFaBackupCodes: null,
    });
  }

  // ──────────────────────────── INVITE ACCEPTANCE ────────────────────────────

  async acceptInvite(dto: AcceptInviteDto, meta: RequestMeta) {
    const user = await this.usersRepo.findOne({
      where: { inviteToken: dto.token },
      relations: ['role'],
    });

    if (
      !user ||
      !user.inviteTokenExpiresAt ||
      user.inviteTokenExpiresAt < new Date()
    ) {
      throw new BadRequestException('This invite link is invalid or has expired');
    }

    user.passwordHash = await argon2.hash(dto.password);
    user.status = UserStatus.ACTIVE;
    user.emailVerified = true;
    user.inviteToken = null;
    user.inviteTokenExpiresAt = null;
    await this.usersRepo.save(user);

    const tokens = await this.issueTokenPair(user, meta);
    return { user: this.sanitiseUser(user), ...tokens };
  }

  // ──────────────────────────────── HELPERS ────────────────────────────────

  private sanitiseUser(user: User) {
    const {
      passwordHash: _passwordHash,
      twoFaSecret: _twoFaSecret,
      twoFaBackupCodes: _twoFaBackupCodes,
      inviteToken: _inviteToken,
      passwordResetToken: _passwordResetToken,
      ...safe
    } = user;
    return safe;
  }
}
