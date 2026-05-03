import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { AbstractHttpAdapter } from '@nestjs/core/adapters';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

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

/** Neon / Postgres unreachable or TCP refused (dev laptop offline, DB suspended, wrong URL). */
function isPrismaDatabaseUnreachable(exception: unknown): boolean {
  return (
    exception instanceof PrismaClientKnownRequestError &&
    (exception.code === 'P1001' || exception.code === 'P1002')
  );
}

/**
 * Avoids noisy ExceptionsHandler ERROR logs for normal client disconnects during file upload.
 * Maps Prisma DB connection failures to HTTP 503 for clearer API clients.
 * Delegates all other errors to Nest’s default handling.
 */
@Catch()
export class ClientDisconnectExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (isPrismaDatabaseUnreachable(exception)) {
      const applicationRef = (this.applicationRef ??
        this.httpAdapterHost?.httpAdapter) as AbstractHttpAdapter | undefined;
      if (!applicationRef || host.getType() !== 'http') {
        super.catch(exception, host);
        return;
      }
      const response = host.switchToHttp().getResponse();
      if (!applicationRef.isHeadersSent(response)) {
        applicationRef.reply(
          response,
          {
            statusCode: 503,
            message:
              'Database is unreachable. If you use Neon, wake the project or check DATABASE_URL and network.',
            code: (exception as PrismaClientKnownRequestError).code,
          },
          503,
        );
      }
      return;
    }
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
