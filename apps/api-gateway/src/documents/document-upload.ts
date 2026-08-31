import { isAxiosError } from 'axios';

/** Drop the local upload only when document-service could not have persisted a row. */
export function shouldDiscardUploadAfterFailure(err: unknown): boolean {
  if (!isAxiosError(err)) {
    return true;
  }
  if (err.response) {
    return false;
  }
  return err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
}
