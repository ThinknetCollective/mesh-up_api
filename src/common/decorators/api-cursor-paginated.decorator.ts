import { Type, applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiQuery, getSchemaPath } from '@nestjs/swagger';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../dto/cursor-pagination-query.dto';

export interface ApiCursorPaginatedOptions {
  /** Entity/DTO returned inside `items`. */
  model: Type<unknown>;
  /** Shown in the docs as the response body. Should be a realistic payload. */
  example: { items: unknown[]; nextCursor: string | null; hasMore: boolean };
  description?: string;
  /** Set for endpoints that still accept the legacy offset param. */
  deprecatedPageParam?: boolean;
}

/**
 * Documents a cursor-paginated endpoint: the `{ items, nextCursor, hasMore }`
 * envelope, the `cursor`/`limit` query params, and a worked example.
 *
 * OpenAPI has no generics, so the envelope has to be spelled out per endpoint
 * with `items` pointed at the model's schema — hence a decorator rather than a
 * shared response class.
 */
export function ApiCursorPaginated(options: ApiCursorPaginatedOptions) {
  const { model, example, description, deprecatedPageParam } = options;

  const decorators = [
    ApiExtraModels(model),
    ApiQuery({
      name: 'cursor',
      required: false,
      type: String,
      description:
        'Opaque token from the previous response `nextCursor`. Omit for the ' +
        'first page. Do not parse or construct it — a cursor is only valid ' +
        'for the exact filter set that produced it.',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: `Page size. Defaults to ${DEFAULT_PAGE_SIZE}, maximum ${MAX_PAGE_SIZE}.`,
    }),
    ApiOkResponse({
      description:
        description ??
        'A page of results. Pass `nextCursor` back as `?cursor=` for the ' +
          'next page; stop when `hasMore` is false.',
      schema: {
        type: 'object',
        required: ['items', 'nextCursor', 'hasMore'],
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          nextCursor: {
            type: 'string',
            nullable: true,
            description:
              'Token for the next page, or null when this is the last page.',
          },
          hasMore: {
            type: 'boolean',
            description: 'Whether at least one more item exists after this page.',
          },
        },
      },
      example,
    }),
  ];

  if (deprecatedPageParam) {
    decorators.push(
      ApiQuery({
        name: 'page',
        required: false,
        type: Number,
        deprecated: true,
        description:
          'DEPRECATED — offset pagination has been replaced by cursor ' +
          'pagination. Accepted for backwards compatibility but ignored. Use ' +
          '`cursor`. See docs/API_CHANGELOG.md for the migration note.',
      }),
    );
  }

  return applyDecorators(...decorators);
}
