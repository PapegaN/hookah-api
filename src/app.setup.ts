import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const appVersion = process.env.npm_package_version ?? '0.1.0';

/**
 * Разреляет CORS-origins только из переменной окружения APP_ORIGIN.
 * В production-окружении отсутствие явного APP_ORIGIN считается
 * ошибкой конфигурации — wildcard больше не разрешается.
 */
function resolveAllowedOrigins(): string[] {
  const rawOrigins = process.env.APP_ORIGIN;

  // В development разрешаем любые origin для удобства локальной разработки
  if (process.env.NODE_ENV !== 'production') {
    return ['*'];
  }

  // В production требуем явного указания хотя бы одного origin
  if (!rawOrigins) {
    throw new Error(
      'APP_ORIGIN environment variable must be set in production to configure CORS allowed origins',
    );
  }

  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error(
      'APP_ORIGIN environment variable must contain at least one valid origin in production',
    );
  }

  return origins;
}

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // В production resolveAllowedOrigins() выбросит ошибку, если APP_ORIGIN не задан
  const allowedOrigins = resolveAllowedOrigins();

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hookah Lounge API')
    .setDescription('API для каталога табака, учета остатков и заказов.')
    .setVersion(appVersion)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/json',
  });
}
