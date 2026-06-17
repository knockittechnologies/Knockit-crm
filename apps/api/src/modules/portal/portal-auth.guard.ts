import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createParamDecorator } from '@nestjs/common';

@Injectable()
export class PortalAuthGuard extends AuthGuard('portal-jwt') {}

export interface AuthenticatedContact {
  contactId: string;
  tenantId: string;
  companyId: string | null;
}

/** Use as @CurrentContact() contact: AuthenticatedContact in portal controllers */
export const CurrentContact = createParamDecorator(
  (data: keyof AuthenticatedContact | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const contact: AuthenticatedContact = request.user;
    return data ? contact?.[data] : contact;
  },
);
