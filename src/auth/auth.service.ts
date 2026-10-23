import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { GoogleProfilePayload } from './google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async handleGoogleLogin(profile: GoogleProfilePayload): Promise<User> {
    let user = await this.usersService.findByGoogleId(profile.googleId);
    if (!user) {
      // Also guard against the same email having signed up a different way
      // in the past (shouldn't happen once Google is the only path in, but
      // cheap to check).
      user = await this.usersService.findByEmail(profile.email);
    }
    if (!user) {
      user = await this.usersService.createFromGoogle(
        profile.googleId,
        profile.email,
        profile.name,
      );
    }
    // Bootstrap: emails listed in BOOTSTRAP_ADMIN_EMAILS (comma-separated)
    // become approved Administrators on sign-in. Solves the "first admin"
    // chicken-and-egg without needing direct database access.
    const bootstrap = (process.env.BOOTSTRAP_ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (bootstrap.includes(user.depedEmail.toLowerCase()) && user.role !== Role.ADMINISTRATOR) {
      user = await this.usersService.promoteToAdministrator(user);
    }
    return user;
  }

  issueToken(user: User): string {
    return this.jwtService.sign({ sub: user.id });
  }
}
