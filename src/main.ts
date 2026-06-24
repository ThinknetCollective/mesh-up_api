import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './websockets/redis-io.adapter';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppException } from './common/exceptions/app.exception';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
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
    .setDescription('Open-source problem-solving API with AI-powered quality scoring')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
