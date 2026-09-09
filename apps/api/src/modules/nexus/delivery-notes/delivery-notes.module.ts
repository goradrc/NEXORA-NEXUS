import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../database/database.module';
import { DeliveryNotesService } from './delivery-notes.service';
import { DeliveryNotesController, InvoiceIssueController } from './delivery-notes.controller';
import { SalesAuthGuard } from './sales-auth.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [DeliveryNotesController, InvoiceIssueController],
  providers: [DeliveryNotesService, SalesAuthGuard],
  exports: [DeliveryNotesService],
})
export class DeliveryNotesModule {}
