import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  LoginDto,
  RegisterTenantDto,
  EnableTwoFaDto,
  AcceptInviteDto,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'knockit_refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  private cookieOptions() {
    const isProd = this.configService.get('app.isProd');
    return {
      httpOnly: true,
      secure: isProd, // HTTPS-only in prod; allow http in local dev
      sameSite: 'lax' as const,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/api/auth',
    };
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterTenantDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerTenant(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 attempts/min — brute-force guard
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (result.requiresTwoFa) {
      return { requiresTwoFa: true, userId: result.userId };
    }

    res.cookie(REFRESH_COOKIE, result.refreshToken!, this.cookieOptions());
    return { user: result.user, accessToken: result.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'No refresh token' });
    }
    const tokens = await this.authService.refresh(refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, this.cookieOptions());
    return { accessToken: tokens.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) await this.authService.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAllSessions(user.userId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  // ── MFA setup flow ──

  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  async generateTwoFa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.generateTwoFaSecret(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  async enableTwoFa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EnableTwoFaDto,
  ) {
    return this.authService.enableTwoFa(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disableTwoFa(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.disableTwoFa(user.userId);
    return { success: true };
  }

  // ── Invite acceptance (employee sets their password) ──

  @Public()
  @Post('accept-invite')
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.acceptInvite(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
    return { user: result.user, accessToken: result.accessToken };
  }
}
