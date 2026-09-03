import { Controller, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '@nexora/core';
import { PrismaClient } from '@prisma/client';

@Controller('api/v1/auth')
export class AuthController {
  @Post('user/default-module')
  async setDefaultModule(
    @Headers('authorization') authHeader: string,
    @Body() body: { defaultModule: string }
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException(
        { error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const token = authHeader.substring(7);
    let payload;
    try {
      payload = AuthService.verifyToken(token);
    } catch (err: any) {
      throw new HttpException(
        { error: 'UNAUTHORIZED', message: err.message || 'Invalid token' },
        HttpStatus.UNAUTHORIZED
      );
    }

    const { defaultModule } = body || {};

    try {
      AuthService.validateDefaultModule(defaultModule);
    } catch (valErr: any) {
      throw new HttpException(
        { error: 'BAD_REQUEST', message: valErr.message },
        HttpStatus.BAD_REQUEST
      );
    }

    if (!process.env.DATABASE_URL) {
      throw new HttpException(
        {
          error: 'SERVICE_UNAVAILABLE',
          message: 'Database configuration missing (DATABASE_URL is not set)',
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    try {
      const prisma = new PrismaClient();
      await prisma.user.update({
        where: { id: payload.userId },
        data: { defaultModule: defaultModule as 'NEXUS' | 'VITALIS' },
      });
    } catch (dbErr: any) {
      throw new HttpException(
        {
          error: 'DATABASE_ERROR',
          message: dbErr.message || 'Failed to update user default module in database',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
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
}
