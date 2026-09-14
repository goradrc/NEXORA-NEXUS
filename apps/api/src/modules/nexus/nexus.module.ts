import { Module } from '@nestjs/common';
import { InvoicesModule } from './invoices/invoices.module';
import { DeliveryNotesModule } from './delivery-notes/delivery-notes.module';

@Module({
  imports: [InvoicesModule, DeliveryNotesModule],
  exports: [InvoicesModule, DeliveryNotesModule],
})
export class NexusModule {}
