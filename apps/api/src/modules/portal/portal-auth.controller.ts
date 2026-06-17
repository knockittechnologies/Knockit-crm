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

import { PortalAuthService } from './portal-auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { PortalAuthGuard, CurrentContact, AuthenticatedContact } from './portal-auth.guard';
import { PortalLoginDto, PortalAcceptInviteDto } from './dto/portal-auth.dto';

const PORTAL_REFRESH_COOKIE = 'knockit_portal_refresh_token';

@Controller('portal/auth')
export class PortalAuthController {
  constructor(
    private portalAuthService: PortalAuthService,
    private configService: ConfigService,
  ) {}

  private cookieOptions() {
    const isProd = this.configService.get('app.isProd');
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/api/portal/auth',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: PortalLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.portalAuthService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(PORTAL_REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
    return { contact: result.contact, accessToken: result.accessToken };
  }

  @Public()
  @Post('accept-invite')
  async acceptInvite(
    @Body() dto: PortalAcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.portalAuthService.acceptInvite(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(PORTAL_REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
    return { contact: result.contact, accessToken: result.accessToken };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[PORTAL_REFRESH_COOKIE];
    if (!refreshToken) {
      return res.status(HttpStatus.UNAUTHORIZED).json({ message: 'No refresh token' });
    }
    const tokens = await this.portalAuthService.refresh(refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.cookie(PORTAL_REFRESH_COOKIE, tokens.refreshToken, this.cookieOptions());
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[PORTAL_REFRESH_COOKIE];
    if (refreshToken) await this.portalAuthService.logout(refreshToken);
    res.clearCookie(PORTAL_REFRESH_COOKIE, { path: '/api/portal/auth' });
    return { success: true };
  }

  @Public()
  @UseGuards(PortalAuthGuard)
  @Get('me')
  async me(@CurrentContact() contact: AuthenticatedContact) {
    return contact;
  }
}
