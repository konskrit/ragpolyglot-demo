export type DocumentStatus =
  | 'uploading'
  | 'processing'
  | 'paused'
  | 'ready'
  | 'failed';

export type DocumentProgressStage =
  | 'waiting_for_ocr'
  | 'extracting'
  | 'embedding';

/** Who runs OCR for a scanned PDF. */
export type OcrEngine = 'tesseract' | 'krakenCPU' | 'krakenGPU';

export type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export type ChatRole = 'user' | 'assistant';

/** Allowlisted .env knobs exposed by GET/PUT /api/config. */
export type ConfigValueKind = 'string' | 'int' | 'bool';

export type OcrLanguageCode = string;

export type ConsumerRegistration<TMessage = unknown> = {
  queueName: string;
  handler: (msg: TMessage | null) => void | Promise<void>;
};
