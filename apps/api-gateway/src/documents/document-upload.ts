import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { isAxiosError } from 'axios';
import { Config } from '../core/config';

const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.pdf',
]);

export const uploadInterceptorOptions = {
  storage: diskStorage({
    destination: Config.uploadsDir,
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: Config.maxUploadBytes, files: 1 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(
        new BadRequestException(
          `Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
        ),
        false,
      );
      return;
    }
    cb(null, true);
  },
};

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
