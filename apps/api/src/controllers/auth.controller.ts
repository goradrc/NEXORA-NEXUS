import { AuthService, TenantContext } from '@nexora/core';
import { OpenApiRegistry } from '../openapi/openapi.doc';

interface RegisteredUser {
  id: string;
  email: string;
  passwordHash: string;
  organizationId: string;
}

export class AuthController {
  private static usersStore: Map<string, RegisteredUser> = new Map([
    [
      'admin@nexora.io',
      {
        id: 'usr-123',
        email: 'admin@nexora.io',
        passwordHash: AuthService.hashPassword('Password123!'),
        organizationId: 'org-1',
      },
    ],
  ]);

  public static registerUser(email: string, passwordHash: string, organizationId: string, userId = `usr-${Date.now()}`): RegisteredUser {
    const user: RegisteredUser = { id: userId, email, passwordHash, organizationId };
    this.usersStore.set(email, user);
    return user;
  }

  public static login(email: string, password: string): { accessToken: string; refreshToken: string; user: any } {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/auth/login',
      method: 'POST',
      summary: 'Authenticate user and obtain JWT tokens',
      tags: ['Authentication'],
      security: false,
      responses: { 200: 'JWT Tokens granted', 401: 'Invalid credentials' },
    });

    if (!email || !password) {
      throw new Error('MISSING_CREDENTIALS: Email and password are required');
    }

    const user = this.usersStore.get(email);
    if (!user) {
      throw new Error('INVALID_CREDENTIALS: Email or password incorrect');
    }

    const isVerified = AuthService.verifyPassword(password, user.passwordHash);
    if (!isVerified) {
      throw new Error('INVALID_CREDENTIALS: Email or password incorrect');
    }

    const payload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
    };

    const tokens = AuthService.generateTokens(payload);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: payload,
    };
  }

  public static getTenantContext(authorizationHeader?: string): TenantContext {
    OpenApiRegistry.registerRoute({
      path: '/api/v1/auth/me',
      method: 'GET',
      summary: 'Get current tenant and user session context',
      tags: ['Authentication'],
      security: true,
      responses: { 200: 'Current tenant session context', 401: 'Unauthorized' },
    });

    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new Error('UNAUTHORIZED: Bearer token is missing');
    }

    const token = authorizationHeader.split(' ')[1];
    const decoded = AuthService.verifyToken(token);

    const tenantContext: TenantContext = {
      organizationId: decoded.organizationId || 'org-1',
      userId: decoded.userId,
    };

    return tenantContext;
  }
}
