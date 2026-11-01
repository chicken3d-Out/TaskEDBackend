import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Carries a "mobile" marker through the OAuth round-trip via the `state`
// parameter, so the callback knows to redirect to the app's deep link
// instead of the web FRONTEND_URL.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // offline access gives us a refresh token for Drive and Calendar.
    // `reconnect=1` forces Google's consent screen again (to repair access).
    const options: Record<string, unknown> = {
      accessType: 'offline',
      includeGrantedScopes: true,
      ...(req.query?.reconnect === '1' ? { prompt: 'consent' } : {}),
    };
    if (req.query?.platform === 'mobile') options['state'] = 'mobile';
    return options;
  }
}
