import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { DocumentSummarizeController } from './document-summarize.controller';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  imports: [CoreModule],
  controllers: [RagController, DocumentSummarizeController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
