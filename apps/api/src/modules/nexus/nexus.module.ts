import { Module } from '@nestjs/common';
import { DeliveryNotesModule } from './delivery-notes/delivery-notes.module';

@Module({
  imports: [DeliveryNotesModule],
  exports: [DeliveryNotesModule],
})
export class NexusModule {}
