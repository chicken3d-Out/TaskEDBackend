import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Pulled off req.user, which JwtStrategy.validate() populates.
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
