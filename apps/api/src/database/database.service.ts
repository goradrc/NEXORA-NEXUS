import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    // Connect to database if DATABASE_URL is provided or in non-test mode
    if (process.env.DATABASE_URL) {
      try {
        await this.$connect();
      } catch {
        // Fallback for offline/test environments without live PostgreSQL
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
