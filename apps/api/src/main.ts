import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { setupSwagger } from "./modules/swagger/swagger-setup";
import { SecurityHeadersMiddleware } from "./common/middleware/security-headers.middleware";
import { RateLimitingMiddleware } from "./common/middleware/rate-limiting.middleware";
import { ApiVersioningMiddleware } from "./common/middleware/api-versioning.middleware";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: [
        process.env.FRONTEND_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000",
      ],
      credentials: true,
    },
  });
  const config = app.get(ConfigService);
  const frontendUrl = config.get<string>("app.frontendUrl");

  const requiredSecrets = [
    config.get<string>("auth.accessSecret"),
    config.get<string>("auth.refreshSecret"),
  ];

  if (process.env.NODE_ENV === "production" && requiredSecrets.some((value) => !value || value.startsWith("dev-"))) {
    throw new Error("Production JWT secrets must be configured before booting the API");
  }

  // WebSocket adapter for Socket.IO
  // @ts-ignore - IoAdapter type mismatch with WebSocketAdapter interface in v11
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global prefix with versioning handled by middleware
  app.setGlobalPrefix("api");

  // CORS configuration
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  // Cookie parser
  app.use(cookieParser());

  // Security headers (applied early)
  const securityHeaders = new SecurityHeadersMiddleware();
  app.use(securityHeaders.use.bind(securityHeaders));

  // API versioning middleware
  const apiVersioning = new ApiVersioningMiddleware();
  app.use(apiVersioning.use.bind(apiVersioning));

  // Rate limiting (after versioning, before routes)
  const rateLimiter = new RateLimitingMiddleware(app.get(ConfigService));
  app.use(rateLimiter.use.bind(rateLimiter));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Setup Swagger documentation
  setupSwagger(app);

  const port = config.get<number>("app.port", 4000);
  await app.listen(port, "0.0.0.0");
}

bootstrap();