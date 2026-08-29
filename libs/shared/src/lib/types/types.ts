export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type DocumentProgressStage = 'extracting' | 'embedding';

export type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export type ChatRole = 'user' | 'assistant';

export type ConsumerHandler<TMessage = unknown> = (
  msg: TMessage | null,
) => void | Promise<void>;

export type ConsumerRegistration<TMessage = unknown> = {
  queueName: string;
  handler: ConsumerHandler<TMessage>;
};
