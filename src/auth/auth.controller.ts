import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { GoogleAuthGuard } from './google-auth.guard';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AdministratorUsesPasswordError, AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { GoogleProfilePayload } from './google.strategy';

@Controller('auth')
export class AuthController {
  // Failed administrator sign-ins per client+username, to slow down guessing.
  private failures = new Map<string, { count: number; first: number }>();
  private static readonly MAX_FAILURES = 5;
  private static readonly WINDOW_MS = 15 * 60 * 1000;

  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private config: ConfigService,
  ) {}

  private throttleKey(req: any, username: string) {
    return `${req.ip}|${(username ?? '').toLowerCase()}`;
  }

  private assertNotThrottled(key: string) {
    const f = this.failures.get(key);
    if (!f) return;
    if (Date.now() - f.first > AuthController.WINDOW_MS) {
      this.failures.delete(key);
      return;
    }
    if (f.count >= AuthController.MAX_FAILURES) {
      throw new HttpException(
        'Too many failed attempts. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(key: string) {
    const f = this.failures.get(key);
    if (!f || Date.now() - f.first > AuthController.WINDOW_MS) {
      this.failures.set(key, { count: 1, first: Date.now() });
    } else {
      f.count++;
    }
  }

  // Administrator sign-in: username + password (no Google).
  @Post('admin-login')
  @HttpCode(200)
  async adminLogin(@Req() req: any, @Body() body: { username: string; password: string }) {
    const key = this.throttleKey(req, body?.username);
    this.assertNotThrottled(key);
    try {
      const user = await this.authService.handleAdminLogin(body?.username, body?.password);
      this.failures.delete(key);
      return { token: this.authService.issueToken(user) };
    } catch (e) {
      this.recordFailure(key);
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() user: User,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.usersService.changeOwnPassword(user, body.currentPassword, body.newPassword);
  }

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
    const isMobile = req.query?.state === 'mobile';
    let user;
    try {
      user = await this.authService.handleGoogleLogin(profile);
    } catch (e) {
      if (e instanceof AdministratorUsesPasswordError) {
        const code = 'admin_use_password';
        if (isMobile) {
          const scheme = this.config.get<string>('MOBILE_APP_SCHEME', 'ph.gov.deped.leyte.tasked');
          return res.redirect(`${scheme}://auth?error=${code}`);
        }
        const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:4200');
        return res.redirect(`${frontend}/login?error=${code}`);
      }
      throw e;
    }
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
