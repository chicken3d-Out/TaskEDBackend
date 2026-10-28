import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { GoogleProfilePayload } from './google.strategy';

export class AdministratorUsesPasswordError extends UnauthorizedException {
  constructor() {
    super('Administrators sign in with their username and password');
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  // DepEd Google sign-in is for regular users (teachers, Administrative
  // Officers, Administrative Office accounts). It can never create or reach
  // an Administrator.
  async handleGoogleLogin(profile: GoogleProfilePayload): Promise<User> {
    let user = await this.usersService.findByGoogleId(profile.googleId);
    if (!user) {
      // An Administrator may have pre-created this person by email; link it.
      const byEmail = await this.usersService.findByEmail(profile.email);
      if (byEmail) user = await this.usersService.linkGoogleId(byEmail, profile.googleId);
    }
    if (!user) {
      user = await this.usersService.createFromGoogle(
        profile.googleId,
        profile.email,
        profile.name,
      );
    }
    if (user.role === Role.ADMINISTRATOR) {
      this.logger.warn(`Google sign-in refused for administrator account ${user.id}`);
      throw new AdministratorUsesPasswordError();
    }
    return user;
  }

  async handleAdminLogin(username: string, password: string): Promise<User> {
    const user = await this.usersService.verifyAdminLogin(username, password);
    if (!user) throw new UnauthorizedException('Incorrect username or password');
    return user;
  }

  issueToken(user: User): string {
    return this.jwtService.sign({ sub: user.id });
  }
}
