import { Module } from '@nestjs/common';
import { NestAuthCorsController } from './nestjs/auth.controller';
import { NestReferentialsController } from './nestjs/referentials.controller';
import { NestOperationsController } from './nestjs/operations.controller';
import { NestSalesController } from './nestjs/sales.controller';
import { NestSyncController } from './nestjs/sync.controller';

@Module({
  imports: [],
  controllers: [
    NestAuthCorsController,
    NestReferentialsController,
    NestOperationsController,
    NestSalesController,
    NestSyncController,
  ],
  providers: [],
})
export class AppModule {}
