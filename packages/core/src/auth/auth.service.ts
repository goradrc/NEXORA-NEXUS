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
  /**
   * Retrieves the JWT secret key. Throws an explicit error if missing in production.
   */
  private static getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL_SECURITY_ERROR: JWT_SECRET environment variable is missing in production!');
      }
      return 'nexora-core-dev-only-secret-key-change-in-prod-2025';
    }
    return secret;
  }

  /**
   * Hashes a password using PBKDF2-SHA512 with 210,000 iterations (OWASP standard).
   */
  public static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const iterations = 210000;
    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    return `${iterations}:${salt}:${hash}`;
  }

  /**
   * Verifies a raw password against the stored PBKDF2 hash using timing-safe comparison.
   */
  public static verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [iterationsStr, salt, originalHash] = parts;
    const iterations = parseInt(iterationsStr, 10);
    if (isNaN(iterations) || !salt || !originalHash) return false;

    const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
    const bufA = Buffer.from(hash, 'hex');
    const bufB = Buffer.from(originalHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Generates JWT Access and Refresh Tokens.
   */
  public static generateTokens(payload: UserPayload): AuthTokens {
    const secret = this.getSecret();
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

    const accessSignature = crypto.createHmac('sha256', secret)
      .update(`${header}.${accessBody}`)
      .digest('base64url');

    const refreshSignature = crypto.createHmac('sha256', secret)
      .update(`${header}.${refreshBody}`)
      .digest('base64url');

    return {
      accessToken: `${header}.${accessBody}.${accessSignature}`,
      refreshToken: `${header}.${refreshBody}.${refreshSignature}`
    };
  }

  /**
   * Decodes and verifies a JWT token using constant-time comparison (Timing Attack Proof).
   */
  public static verifyToken<T = UserPayload>(token: string): T {
    const secret = this.getSecret();
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token structure');
    }

    const [header, payload, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const bufSig = Buffer.from(signature, 'utf-8');
    const bufExp = Buffer.from(expectedSignature, 'utf-8');

    if (bufSig.length !== bufExp.length || !crypto.timingSafeEqual(bufSig, bufExp)) {
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
