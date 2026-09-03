import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@nexora/core';
import { PrismaClient } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = AuthService.verifyToken(token);
    } catch (err: any) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: err.message || 'Invalid token' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { defaultModule } = body;

    try {
      AuthService.validateDefaultModule(defaultModule);
    } catch (valErr: any) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: valErr.message },
        { status: 400 }
      );
    }

    // Require DATABASE_URL environment variable; fail with 503 if missing
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          error: 'SERVICE_UNAVAILABLE',
          message: 'Database configuration missing (DATABASE_URL is not set)',
        },
        { status: 503 }
      );
    }

    // Perform database update via Prisma ORM; fail with 500 if DB operation fails
    try {
      const prisma = new PrismaClient();
      await prisma.user.update({
        where: { id: payload.userId },
        data: { defaultModule: defaultModule as 'NEXUS' | 'VITALIS' },
      });
    } catch (dbErr: any) {
      return NextResponse.json(
        {
          error: 'DATABASE_ERROR',
          message: dbErr.message || 'Failed to update user default module in database',
        },
        { status: 500 }
      );
    }

    const updatedPayload = {
      ...payload,
      defaultModule: defaultModule as 'NEXUS' | 'VITALIS',
    };

    const tokens = AuthService.generateTokens(updatedPayload);

    return NextResponse.json({
      success: true,
      defaultModule,
      tokens,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
