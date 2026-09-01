import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DOCUMENT_PROGRESS_STAGES,
  DOCUMENT_STATUSES,
} from '@ragpolyglot-shared';

export class DocumentSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ example: 'pdf' })
  fileExt?: string;

  @ApiProperty({ enum: DOCUMENT_STATUSES })
  status!: string;

  @ApiPropertyOptional({ example: 'chunking_error' })
  errorReason?: string;

  @ApiPropertyOptional({ enum: DOCUMENT_PROGRESS_STAGES })
  progressStage?: string;

  @ApiPropertyOptional()
  progressDone?: number;

  @ApiPropertyOptional()
  progressTotal?: number;

  @ApiPropertyOptional({ example: 'grc' })
  ocrLang?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: string;
}

export class OcrLanguageOptionDto {
  @ApiProperty({ example: 'grc' })
  code!: string;

  @ApiProperty({ example: 'Greek (Ancient)' })
  label!: string;
}

export class DocumentChunkDto {
  @ApiPropertyOptional()
  id?: number;

  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty({ description: '0-based chunk index in storage' })
  chunkIndex!: number;

  @ApiProperty()
  content!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: string;
}

export class SourceDto {
  @ApiProperty({ format: 'uuid' })
  documentId!: string;

  @ApiProperty()
  documentTitle!: string;

  @ApiProperty()
  chunkContent!: string;

  @ApiProperty({ description: 'Cosine similarity 0–1' })
  similarity!: number;

  @ApiPropertyOptional({ description: '0-based; use for #chunk-N deep links' })
  chunkIndex?: number;
}

export class ChatResponseDto {
  @ApiProperty({ enum: ['assistant'] })
  role!: 'assistant';

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: [SourceDto] })
  sources!: SourceDto[];

  @ApiProperty()
  cacheHit!: boolean;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;
}

export class ConversationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ConversationMessageDto {
  @ApiProperty()
  id!: number;

  @ApiProperty({ format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role!: string;

  @ApiProperty()
  text!: string;

  @ApiPropertyOptional({ type: [SourceDto] })
  sources?: SourceDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'api-gateway' })
  service!: string;

  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ enum: ['ok', 'error'] })
  document_service!: string;

  @ApiProperty({ enum: ['ok', 'error'] })
  rag_worker!: string;

  @ApiProperty({ enum: ['ok', 'error'] })
  event_processor!: string;

  @ApiProperty({ enum: ['ok', 'error'] })
  redis!: string;

  @ApiProperty({ enum: ['ok', 'error'] })
  rabbitmq!: string;

  @ApiProperty()
  uptime!: number;
}

class MetricsCacheDto {
  @ApiProperty() hits!: number;
  @ApiProperty() misses!: number;
  @ApiPropertyOptional({ nullable: true }) hitRate!: number | null;
}

class MetricsQuerySeriesPointDto {
  @ApiProperty() hour!: string;
  @ApiProperty() count!: number;
  @ApiProperty() avgMs!: number;
}

class MetricsQueriesDto {
  @ApiProperty() last24h!: number;
  @ApiPropertyOptional({ nullable: true }) avgLatencyMs!: number | null;
  @ApiProperty({ type: [MetricsQuerySeriesPointDto] })
  series!: MetricsQuerySeriesPointDto[];
}

class MetricsIngestDto {
  @ApiProperty() processed24h!: number;
  @ApiProperty() failed24h!: number;
  @ApiPropertyOptional({ nullable: true }) avgChunkingMs!: number | null;
  @ApiPropertyOptional({ nullable: true }) avgEmbeddingMs!: number | null;
}

class MetricsDocumentsDto {
  @ApiProperty() uploading!: number;
  @ApiProperty() processing!: number;
  @ApiProperty() ready!: number;
  @ApiProperty() failed!: number;
}

class MetricsJobsDto {
  @ApiProperty() completed24h!: number;
  @ApiProperty() failed24h!: number;
}

class MetricsRedisDto {
  @ApiPropertyOptional({ nullable: true }) usedMemoryBytes!: number | null;
}

export class MetricsSnapshotDto {
  @ApiProperty({ type: MetricsCacheDto }) cache!: MetricsCacheDto;
  @ApiProperty({ type: MetricsQueriesDto }) queries!: MetricsQueriesDto;
  @ApiProperty({ type: MetricsIngestDto }) ingest!: MetricsIngestDto;
  @ApiProperty({ type: MetricsDocumentsDto }) documents!: MetricsDocumentsDto;
  @ApiProperty({ type: MetricsJobsDto }) jobs!: MetricsJobsDto;
  @ApiProperty({ type: MetricsRedisDto }) redis!: MetricsRedisDto;
}

export class OcrLangBodyDto {
  @ApiPropertyOptional({
    example: 'grc',
    description: 'OCR language code; omit or null to clear',
  })
  ocrLang?: string | null;
}
