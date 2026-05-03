import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ClientDisconnectExceptionFilter } from './client-disconnect-exception.filter';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new ClientDisconnectExceptionFilter(httpAdapterHost.httpAdapter),
  );
  app.useWebSocketAdapter(new IoAdapter(app));
  const webOrigins = process.env.WEB_ORIGIN;
  const fromEnv = webOrigins
    ? webOrigins
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const expoWebDev = ['http://localhost:8081', 'http://127.0.0.1:8081'];
  const isProd = process.env.NODE_ENV === 'production';
  const allowList =
    fromEnv.length > 0
      ? [...new Set([...fromEnv, ...(isProd ? [] : expoWebDev)])]
      : null;
  app.enableCors({
    origin: allowList ?? true,
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
