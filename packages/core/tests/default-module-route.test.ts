import { POST } from '../../../apps/web/src/app/api/auth/user/default-module/route';
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

describe('POST /api/auth/user/default-module Route Handler', () => {
  const originalEnv = process.env;
  let mockUpdateFn: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockUpdate.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return 401 Unauthorized if Authorization header is missing', async () => {
    const req = {
      headers: {
        get: (key: string) => null,
      },
      json: async () => ({ defaultModule: 'NEXUS' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe('UNAUTHORIZED');
  });

  it('should return 400 Bad Request if defaultModule is invalid', async () => {
    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const req = {
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? `Bearer ${token}` : null),
      },
      json: async () => ({ defaultModule: 'INVALID_MODULE' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('BAD_REQUEST');
  });

  it('should return 503 Service Unavailable if DATABASE_URL environment variable is missing', async () => {
    delete process.env.DATABASE_URL;

    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const req = {
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? `Bearer ${token}` : null),
      },
      json: async () => ({ defaultModule: 'NEXUS' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.error).toBe('SERVICE_UNAVAILABLE');
    expect(data.message).toContain('DATABASE_URL is not set');
  });

  it('should return 500 Internal Server Error if prisma.user.update fails', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/nexora_db';
    mockUpdate.mockRejectedValue(new Error('PostgreSQL connection timeout'));

    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const req = {
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? `Bearer ${token}` : null),
      },
      json: async () => ({ defaultModule: 'VITALIS' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(500);

    const data = await res.json();
    expect(data.error).toBe('DATABASE_ERROR');
    expect(data.message).toBe('PostgreSQL connection timeout');
  });

  it('should return 200 OK and new tokens when prisma.user.update succeeds', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/nexora_db';
    mockUpdate.mockResolvedValue({ id: 'usr-1', defaultModule: 'NEXUS' });

    const token = AuthService.generateTokens({ userId: 'usr-1', email: 'test@nexora.io' }).accessToken;
    const req = {
      headers: {
        get: (key: string) => (key.toLowerCase() === 'authorization' ? `Bearer ${token}` : null),
      },
      json: async () => ({ defaultModule: 'NEXUS' }),
    } as any;

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.defaultModule).toBe('NEXUS');
    expect(data.tokens?.accessToken).toBeDefined();

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'usr-1' },
      data: { defaultModule: 'NEXUS' },
    });
  });
});
