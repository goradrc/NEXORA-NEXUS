import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { NexusModule } from './modules/nexus/nexus.module';
import { SessionModule } from './auth/auth.module';

@Module({
  imports: [DatabaseModule, HealthModule, NexusModule, SessionModule],
})
export class AppModule {}
