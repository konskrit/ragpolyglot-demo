export type DocumentStatus =
  | 'uploading'
  | 'processing'
  | 'paused'
  | 'ready'
  | 'failed';

export type DocumentProgressStage = 'extracting' | 'embedding';

export type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export type ChatRole = 'user' | 'assistant';

export type OcrLanguageCode = string;

export type ConsumerRegistration<TMessage = unknown> = {
  queueName: string;
  handler: (msg: TMessage | null) => void | Promise<void>;
};
