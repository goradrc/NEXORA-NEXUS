import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { NexusModule } from './modules/nexus/nexus.module';

@Module({
  imports: [DatabaseModule, HealthModule, NexusModule],
})
export class AppModule {}
