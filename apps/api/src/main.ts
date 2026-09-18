import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";

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

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(config.get<number>("app.port", 4000));
}

bootstrap();
