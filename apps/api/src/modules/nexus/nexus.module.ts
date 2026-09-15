import { Module } from '@nestjs/common';
import { DeliveryNotesModule } from './delivery-notes/delivery-notes.module';
import { InvoicesModule } from './invoices/invoices.module';

@Module({
  imports: [DeliveryNotesModule, InvoicesModule],
  exports: [DeliveryNotesModule, InvoicesModule],
})
export class NexusModule {}
