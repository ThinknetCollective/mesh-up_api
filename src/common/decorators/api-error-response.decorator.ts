import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

export function ApiAppErrorResponse(
  statusCode: number,
  description: string,
  errorCode = 'ERROR_CODE',
) {
  return applyDecorators(
    ApiResponse({
      status: statusCode,
      description,
      schema: {
        type: 'object',
        properties: {
          statusCode: {
            type: 'number',
            example: statusCode,
          },
          message: {
            type: 'string',
            example: 'Error description message',
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  example: 'propertyName',
                },
                message: {
                  type: 'string',
                  example: 'Validation error message for this property',
                },
              },
            },
          },
          errorCode: {
            type: 'string',
            example: errorCode,
          },
          timestamp: {
            type: 'string',
            example: '2026-01-06T23:00:00Z',
          },
          path: {
            type: 'string',
            example: '/api/v1/resource',
          },
        },
      },
    }),
  );
}
