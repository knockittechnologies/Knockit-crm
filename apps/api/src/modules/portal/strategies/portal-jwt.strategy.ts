import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PortalJwtPayload } from '../portal-auth.service';

@Injectable()
export class PortalJwtStrategy extends PassportStrategy(Strategy, 'portal-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: PortalJwtPayload) {
    // Defence in depth: a staff-issued JWT and a portal-issued JWT share
    // the same signing secret (simpler key management), so without this
    // check a staff member's access token would also pass this guard and
    // be treated as a valid portal session. The `scope` claim is what
    // keeps the two token types from being interchangeable.
    if (payload.scope !== 'portal') {
      throw new UnauthorizedException('Invalid token scope for portal access');
    }
    return {
      contactId: payload.sub,
      tenantId: payload.tenantId,
      companyId: payload.companyId,
    };
  }
}
