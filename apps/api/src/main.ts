import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const webOrigins = process.env.WEB_ORIGIN;
  app.enableCors({
    origin: webOrigins ? webOrigins.split(',').map((s) => s.trim()) : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port);
}
void bootstrap();
