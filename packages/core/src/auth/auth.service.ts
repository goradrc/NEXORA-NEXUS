import * as crypto from 'crypto';

export interface UserPayload {
  userId: string;
  email: string;
  organizationId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  private static readonly SECRET = process.env.JWT_SECRET || 'nexora-core-secret-key-2025';

  /**
   * Hashes a password securely using SHA-256 / Salt.
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  /**
   * Verifies a raw password against the stored hash.
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  }

  /**
   * Generates JWT Access and Refresh Tokens.
   */
  public static generateTokens(payload: UserPayload): AuthTokens {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

    const now = Math.floor(Date.now() / 1000);
    const accessBody = Buffer.from(JSON.stringify({
      ...payload,
      iat: now,
      exp: now + 3600 // 1 hour
    })).toString('base64url');

    const refreshBody = Buffer.from(JSON.stringify({
      userId: payload.userId,
      iat: now,
      exp: now + (86400 * 7) // 7 days
    })).toString('base64url');

    const accessSignature = crypto.createHmac('sha256', this.SECRET)
      .update(`${header}.${accessBody}`)
      .digest('base64url');

    const refreshSignature = crypto.createHmac('sha256', this.SECRET)
      .update(`${header}.${refreshBody}`)
      .digest('base64url');

    return {
      accessToken: `${header}.${accessBody}.${accessSignature}`,
      refreshToken: `${header}.${refreshBody}.${refreshSignature}`
    };
  }

  /**
   * Decodes and verifies a JWT token.
   */
  public static verifyToken<T = UserPayload>(token: string): T {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token structure');
    }

    const [header, payload, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', this.SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token expired');
    }

    return decoded as T;
  }
}
