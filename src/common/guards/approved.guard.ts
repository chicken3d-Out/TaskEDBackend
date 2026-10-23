import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SKIP_APPROVAL_CHECK_KEY } from '../decorators/skip-approval-check.decorator';
import { AccountStatus } from '../enums/role.enum';

// Runs after JwtAuthGuard. Blocks anyone who isn't APPROVED from every
// route except the ones explicitly marked @SkipApprovalCheck().
@Injectable()
export class ApprovedGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_APPROVAL_CHECK_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (user.status !== AccountStatus.APPROVED) {
      throw new ForbiddenException(
        `Your account is ${user.status}. You need approval before you can use TaskEd.`,
      );
    }
    return true;
  }
}
