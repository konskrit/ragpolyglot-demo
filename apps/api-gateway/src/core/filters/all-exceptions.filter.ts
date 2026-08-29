import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { Response } from 'express';
import { MulterError } from 'multer';
import { Config } from '../config';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      return this.send(response, exception);
    }

    if (exception instanceof MulterError) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        const limitMb = Math.round(Config.maxUploadBytes / (1024 * 1024));
        return this.send(
          response,
          new HttpException(`File exceeds the ${limitMb} MB upload limit`, 413),
        );
      }
      return this.send(response, new HttpException(exception.message, 400));
    }

    if (this.isAxiosError(exception)) {
      const err = exception as AxiosError<{
        message?: string;
        error?: string;
        detail?: string;
      }>;
      const upstreamStatus = err.response?.status ?? 502;
      const message =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.response?.data?.error ||
        this.describeAxiosError(err);

      if (err.code === 'ECONNABORTED') {
        return this.send(response, new HttpException('Request timed out', 504));
      }

      const status =
        upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502;

      this.logger.error(
        `Upstream error [${upstreamStatus}]: ${message}`,
        err.stack,
      );
      return this.send(response, new HttpException(message, status));
    }

    const message =
      exception instanceof Error ? exception.message : 'Internal server error';
    this.logger.error(
      `Unhandled exception: ${message}`,
      (exception as Error)?.stack,
    );
    return this.send(response, new HttpException('Internal server error', 500));
  }

  private send(response: Response, exception: HttpException): void {
    const status = exception.getStatus();
    const body = exception.getResponse() as Record<string, unknown>;
    response.status(status).json(body);
  }

  private isAxiosError(err: unknown): err is AxiosError {
    return (
      typeof err === 'object' &&
      err !== null &&
      (err as AxiosError).isAxiosError === true
    );
  }

  private describeAxiosError(err: AxiosError): string {
    switch (err.code) {
      case 'ECONNREFUSED':
        return 'Upstream service is unreachable';
      case 'ENOTFOUND':
        return 'Upstream service host not found';
      default:
        return err.message || 'Upstream request failed';
    }
  }
}
