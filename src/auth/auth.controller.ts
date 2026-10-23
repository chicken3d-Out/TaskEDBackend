import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { GoogleAuthGuard } from './google-auth.guard';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleProfilePayload } from './google.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // Kicks off the OAuth dance - the frontend just links/redirects here.
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Passport handles the redirect to Google; this body never runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const profile = req.user as GoogleProfilePayload;
    const user = await this.authService.handleGoogleLogin(profile);
    const token = this.authService.issueToken(user);

    // Mobile (Capacitor) logins run in the system browser, so hand the token
    // back to the app through its custom-scheme deep link. An HTML bridge page
    // is used (rather than a bare 302) because some browsers block redirects
    // to custom schemes that aren't user-initiated.
    if (req.query?.state === 'mobile') {
      const scheme = this.config.get<string>('MOBILE_APP_SCHEME', 'ph.gov.deped.leyte.tasked');
      const deepLink = `${scheme}://auth?token=${encodeURIComponent(token)}`;
      res.type('html').send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>TaskEd</title>
<meta http-equiv="refresh" content="0;url=${deepLink}">
<style>body{font-family:sans-serif;text-align:center;padding:3rem 1rem}a{display:inline-block;margin-top:1rem;padding:.8rem 1.4rem;background:#1b4f9c;color:#fff;border-radius:8px;text-decoration:none}</style></head>
<body><p>Signing you in to TaskEd…</p><a href="${deepLink}">Open TaskEd</a>
<script>window.location.href=${JSON.stringify(deepLink)};</script></body></html>`);
      return;
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:4200');
    // Frontend reads `token` off the URL, stores it, then calls GET /users/me
    // to decide whether to route to registration / pending / the app.
    res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(token)}`);
  }
}
