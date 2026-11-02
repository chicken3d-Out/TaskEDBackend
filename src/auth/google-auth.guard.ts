import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Carries a "mobile" marker through the OAuth round-trip via the `state`
// parameter, so the callback knows to redirect to the app's deep link
// instead of the web FRONTEND_URL.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const options: Record<string, unknown> = {};
    if (req.query?.platform === 'mobile') options['state'] = 'mobile';
    return options;
  }
}
