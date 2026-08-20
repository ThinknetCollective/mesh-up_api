import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errors = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        message = exceptionResponse.message || message;
        errorCode = exceptionResponse.errorCode || 'HTTP_EXCEPTION';
        errors = exceptionResponse.errors || undefined;
      }
    } else {
      this.logger.error(
        `Unhandled exception: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    // Default formatting for common known errors like standard 400 Bad Request
    if (statusCode === 400 && errorCode === 'HTTP_EXCEPTION') {
       errorCode = 'BAD_REQUEST';
    } else if (statusCode === 401 && errorCode === 'HTTP_EXCEPTION') {
       errorCode = 'UNAUTHORIZED';
    } else if (statusCode === 403 && errorCode === 'HTTP_EXCEPTION') {
       errorCode = 'FORBIDDEN';
    } else if (statusCode === 404 && errorCode === 'HTTP_EXCEPTION') {
       errorCode = 'NOT_FOUND';
    }

    const errorResponse = {
      statusCode,
      message,
      ...(errors && { errors }),
      errorCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(errorResponse);
  }
}
