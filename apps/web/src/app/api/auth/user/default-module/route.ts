import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@nexora/core';

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

    // Update Prisma User record if DATABASE_URL is configured
    if (process.env.DATABASE_URL) {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        await prisma.user.update({
          where: { id: payload.userId },
          data: { defaultModule: defaultModule }
        });
      } catch (dbErr: any) {
        console.warn('Database update skipped or failed:', dbErr.message);
      }
    }

    const updatedPayload = {
      ...payload,
      defaultModule: defaultModule as 'NEXUS' | 'VITALIS'
    };

    const tokens = AuthService.generateTokens(updatedPayload);

    return NextResponse.json({
      success: true,
      defaultModule,
      tokens
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
