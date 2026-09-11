import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentSummarizeController } from './document-summarize.controller';
import { DocumentService } from './document.service';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  controllers: [DocumentController, DocumentSummarizeController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
