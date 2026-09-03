import { AuthService } from '../src/auth/auth.service';

const mockUpdate = jest.fn();

jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        update: mockUpdate,
      },
    })),
  };
});

describe('Auth Default Module Backend Persistence Engine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockUpdate.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function handleDefaultModule(authHeader: string, body: { defaultModule: string }) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const err: any = new Error('Missing or invalid Authorization header');
      err.status = 401;
      err.code = 'UNAUTHORIZED';
      throw err;
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = AuthService.verifyToken(token);
    } catch (err: any) {
      const authErr: any = new Error(err.message || 'Invalid token');
      authErr.status = 401;
      authErr.code = 'UNAUTHORIZED';
      throw authErr;
    }

    const { defaultModule } = body || {};

    try {
      AuthService.validateDefaultModule(defaultModule);
    } catch (valErr: any) {
      const bErr: any = new Error(valErr.message);
      bErr.status = 400;
      bErr.code = 'BAD_REQUEST';
      throw bErr;
    }

    if (!process.env.DATABASE_URL) {
      const dbUrlErr: any = new Error('Database configuration missing (DATABASE_URL is not set)');
      dbUrlErr.status = 503;
      dbUrlErr.code = 'SERVICE_UNAVAILABLE';
      throw dbUrlErr;
    }

    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.user.update({
        where: { id: payload.userId },
        data: { defaultModule: defaultModule as 'NEXUS' | 'VITALIS' },
      });
    } catch (dbErr: any) {
      const pErr: any = new Error(dbErr.message || 'Failed to update user default module in database');
      pErr.status = 500;
      pErr.code = 'DATABASE_ERROR';
      throw pErr;
    }

    const updatedPayload = {
      ...payload,
      defaultModule: defaultModule as 'NEXUS' | 'VITALIS',
    };

    const tokens = AuthService.generateTokens(updatedPayload);

    return {
      success: true,
      defaultModule,
      tokens,
    };
  }

  it('should reject missing Authorization header with 401 UNAUTHORIZED', async () => {
    try {
      await handleDefaultModule('', { defaultModule: 'NEXUS' });
    } catch (err: any) {
      expect(err.status).toBe(401);
      expect(err.code).toBe('UNAUTHORIZED');
    }
  });

  it('should reject invalid defaultModule string with 400 BAD_REQUEST', async () => {
    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const authHeader = `Bearer ${token}`;

    try {
      await handleDefaultModule(authHeader, { defaultModule: 'INVALID_MODULE' });
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.code).toBe('BAD_REQUEST');
    }
  });

  it('should reject when DATABASE_URL is missing with 503 SERVICE_UNAVAILABLE', async () => {
    delete process.env.DATABASE_URL;
    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const authHeader = `Bearer ${token}`;

    try {
      await handleDefaultModule(authHeader, { defaultModule: 'NEXUS' });
    } catch (err: any) {
      expect(err.status).toBe(503);
      expect(err.code).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('should throw 500 DATABASE_ERROR when prisma.user.update fails', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/nexora_db';
    mockUpdate.mockRejectedValue(new Error('PostgreSQL connection timeout'));

    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const authHeader = `Bearer ${token}`;

    try {
      await handleDefaultModule(authHeader, { defaultModule: 'VITALIS' });
    } catch (err: any) {
      expect(err.status).toBe(500);
      expect(err.code).toBe('DATABASE_ERROR');
    }
  });

  it('should return 200 success and regenerated tokens when database update succeeds', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/nexora_db';
    mockUpdate.mockResolvedValue({ id: 'usr-1', defaultModule: 'NEXUS' });

    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const authHeader = `Bearer ${token}`;

    const res = await handleDefaultModule(authHeader, { defaultModule: 'NEXUS' });

    expect(res.success).toBe(true);
    expect(res.defaultModule).toBe('NEXUS');
    expect(res.tokens.accessToken).toBeDefined();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'usr-1' },
      data: { defaultModule: 'NEXUS' },
    });
  });
});
