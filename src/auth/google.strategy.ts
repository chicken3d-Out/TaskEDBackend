import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfilePayload {
  googleId: string;
  email: string;
  name: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly allowedDomain: string;

  constructor(private config: ConfigService) {
    const options: StrategyOptions = {
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
      // hd nudges Google's account chooser toward the workspace domain, but
      // it is NOT trustworthy as a security check on its own (a user could
      // still complete the flow with a personal account in some setups) -
      // we re-verify the actual email domain below.
    };
    super(options);
    this.allowedDomain = config.get<string>('ALLOWED_EMAIL_DOMAIN', 'deped.gov.ph');
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const email: string | undefined = profile?.emails?.[0]?.value;
    const name: string = profile?.displayName ?? '';
    const googleId: string = profile?.id;

    if (!email) {
      return done(new UnauthorizedException('Google account has no email'), false as any);
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (domain !== this.allowedDomain.toLowerCase()) {
      return done(
        new UnauthorizedException(
          `Only @${this.allowedDomain} accounts may sign in to TaskEd`,
        ),
        false as any,
      );
    }

    const payload: GoogleProfilePayload = { googleId, email, name };
    done(null, payload as any);
  }
}
