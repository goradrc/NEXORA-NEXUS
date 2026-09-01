import { Controller, Get, Post, Body, Headers, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SyncController as CoreSyncController } from '../controllers/sync.controller';
import { AuthController as AuthCoreController } from '../controllers/auth.controller';

@ApiTags('Synchronization')
@ApiBearerAuth()
@Controller('api/v1/sync')
export class NestSyncController {
  @Post('push')
  @ApiOperation({ summary: 'Push batch offline mutations to server with idempotency' })
  pushMutations(@Headers('authorization') authHeader: string, @Body() batch: any) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSyncController.pushMutations(tenantCtx, batch, [
      'nexus:stock:create', 'nexus:catalog:read', 'nexus:expenses:create',
      'nexus:employees:create', 'nexus:quotes:create', 'nexus:invoices:create', 'nexus:payments:create',
    ]);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Pull server deltas since client last sync timestamp' })
  pullDeltas(@Headers('authorization') authHeader: string, @Query('since') since?: string) {
    const tenantCtx = AuthCoreController.getTenantContext(authHeader);
    return CoreSyncController.pullDeltas(tenantCtx, since);
  }
}
