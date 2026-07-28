import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationError } from 'class-validator';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './websockets/redis-io.adapter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppException } from './common/exceptions/app.exception';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new HttpExceptionFilter());

  // A single global pipe. Registering two would chain them: the first strips
  // unknown properties via `whitelist`, so a second pipe's
  // `forbidNonWhitelisted` never sees them and silently never fires — and its
  // lack of an exceptionFactory would bypass the AppException formatting below.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: (validationErrors: ValidationError[] = []) => {
        const formatErrors = (errors: ValidationError[]): any[] => {
          return errors.flatMap((error) => {
            if (error.children && error.children.length > 0) {
              return formatErrors(error.children);
            }
            return {
              field: error.property,
              message: Object.values(error.constraints || {})[0],
            };
          });
        };

        const errors = formatErrors(validationErrors);
        return new AppException('Validation failed', 'VALIDATION_FAILED', 400, errors);
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('mesh-up_api')
    .setDescription(
      'Open-source problem-solving API with AI-powered quality scoring.\n\n' +
        '## Pagination\n\n' +
        'List endpoints use **cursor-based (keyset) pagination** and return a ' +
        'uniform envelope:\n\n' +
        '```json\n' +
        '{ "items": [ ... ], "nextCursor": "eyJwIjoxLC...", "hasMore": true }\n' +
        '```\n\n' +
        'Send `?limit=N` (max 100, default 20) to size a page. To fetch the ' +
        'next page, pass the previous response\'s `nextCursor` back verbatim ' +
        'as `?cursor=`. Stop when `hasMore` is `false`, at which point ' +
        '`nextCursor` is always `null`.\n\n' +
        '`cursor` is an opaque token — do not parse, construct or modify it. ' +
        'It encodes the sort key of the last row on the page plus a ' +
        'fingerprint of the filters in effect, so replaying a cursor against ' +
        'a different filter set returns `400 VALIDATION_FAILED` rather than ' +
        'inconsistent results.\n\n' +
        'Unlike offset pagination, rows inserted between two page fetches ' +
        'cannot cause items to be duplicated or skipped.\n\n' +
        '### Deprecated: `page`\n\n' +
        'The offset param `page` is still accepted on `GET /search` and ' +
        '`GET /solutions/{id}/comments` but is **ignored**. See ' +
        '`docs/API_CHANGELOG.md` for the migration note and removal timeline.',
    )
    .setVersion('1.0')
    .addTag('Solutions', 'Problem solutions, ranking and revision history')
    .addTag('Comments', 'Threaded comments on solutions')
    .addTag('Search', 'Full-text search across mesh nodes')
    .addTag('Health', 'Liveness and readiness probes')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
