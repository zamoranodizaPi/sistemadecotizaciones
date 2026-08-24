import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

// El importador de catalogo (POST /api/imports/excel) envia el archivo como
// base64 dentro del body JSON, lo que infla ~33% su tamano real. El limite
// por defecto de Express (~100kb) no alcanza para un Excel real; se sube
// explicitamente aqui. TODO: migrar ese endpoint a multipart/form-data.
const JSON_BODY_LIMIT = '25mb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.use(json({ limit: JSON_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT || 5001);
}

bootstrap();
