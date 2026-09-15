import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { SalesAuthGuard } from '../delivery-notes/sales-auth.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, SalesAuthGuard],
  exports: [InvoicesService],
})
export class InvoicesModule {}
