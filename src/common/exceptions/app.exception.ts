import { HttpException, HttpStatus } from '@nestjs/common';

export class AppException extends HttpException {
  public readonly errorCode: string;

  constructor(
    message: string,
    errorCode: string,
    statusCode: HttpStatus = HttpStatus.BAD_REQUEST,
    errors?: any[],
  ) {
    const response = {
      message,
      errorCode,
      statusCode,
      ...(errors && { errors }),
    };

    super(response, statusCode);
    this.errorCode = errorCode;
  }
}
