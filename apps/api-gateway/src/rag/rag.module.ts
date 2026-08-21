import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  imports: [CoreModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
