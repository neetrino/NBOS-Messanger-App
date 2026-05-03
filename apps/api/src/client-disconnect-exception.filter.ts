import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { AbstractHttpAdapter } from '@nestjs/core/adapters';

/** Multer / Node emit these when the client drops the connection during multipart upload. */
function isMultipartClientDisconnect(exception: unknown): boolean {
  if (!(exception instanceof Error)) {
    return false;
  }
  const { message } = exception;
  return (
    message === 'Request aborted' ||
    message === 'Request closed' ||
    message === 'Unexpected end of form'
  );
}

/**
 * Avoids noisy ExceptionsHandler ERROR logs for normal client disconnects during file upload.
 * Delegates all other errors to Nest’s default handling.
 */
@Catch()
export class ClientDisconnectExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (!isMultipartClientDisconnect(exception)) {
      super.catch(exception, host);
      return;
    }
    const applicationRef = (this.applicationRef ??
      this.httpAdapterHost?.httpAdapter) as AbstractHttpAdapter | undefined;
    if (!applicationRef) {
      super.catch(exception, host);
      return;
    }
    const response = host.switchToHttp().getResponse();
    if (!applicationRef.isHeadersSent(response)) {
      // 499 = client closed request (common convention; not in IANA but widely used)
      applicationRef.reply(response, null, 499);
    }
  }
}
