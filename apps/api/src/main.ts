import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
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
  app.use(new SecurityHeadersMiddleware().use);

  // API versioning middleware
  app.use(new ApiVersioningMiddleware().use);

  // Rate limiting (after versioning, before routes)
  const rateLimiter = new RateLimitingMiddleware(app.get(ConfigService));
  app.use(rateLimiter.use.bind(rateLimiter));

  // Cookie parser
  app.use(cookieParser());

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

  await app.listen(config.get<number>("app.port", 4000));
}

bootstrap();