import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../../../../packages/core/src';

@Injectable()
export class SalesAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    try {
      if (!process.env.JWT_SECRET) throw new Error('JWT secret must be configured');
      const authorization = request.headers.authorization;
      if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new Error('Bearer required');
      const token = authorization.slice(7);
      const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
      if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Invalid JWT type');
      const payload = AuthService.verifyToken<any>(token);
      if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000 ||
          typeof payload.email !== 'string' || !payload.email ||
          typeof payload.userId !== 'string' || !payload.userId ||
          typeof payload.organizationId !== 'string' || !payload.organizationId) throw new Error('Invalid access claims');
      request.tenantContext = { userId: payload.userId, organizationId: payload.organizationId };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or missing access token');
    }
  }
}
