import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Every protected route runs through this. Populates req.user from the JWT.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
