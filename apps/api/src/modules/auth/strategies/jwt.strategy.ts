import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  roleId: string;
  roleSlug: string;
  scope: 'staff';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  // Whatever this returns becomes `request.user` in every controller.
  async validate(payload: JwtPayload) {
    // Staff and portal JWTs share the same signing secret, so without this
    // explicit scope check a portal (client contact) token would also pass
    // signature verification here and be treated as a staff session —
    // landing in every controller with roleId/roleSlug undefined rather
    // than being cleanly rejected. The `scope` claim is what keeps the two
    // token types from ever being interchangeable. See PortalJwtStrategy
    // for the mirror-image check on the portal side.
    if (payload.scope !== 'staff') {
      throw new UnauthorizedException('Invalid token scope for staff access');
    }
    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      roleId: payload.roleId,
      roleSlug: payload.roleSlug,
    };
  }
}
