import { INestApplication } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";

export function setupSwagger(app: INestApplication): void {
  const configService = app.get(ConfigService);

  const config = new DocumentBuilder()
    .setTitle("ANTARA ERP API")
    .setDescription(
      "API documentation for ANTARA ERP - AI-powered operations and collaboration platform for satellite engineering teams",
    )
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        description: "Enter JWT token",
        in: "header",
      },
      "access-token",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-API-Version",
        in: "header",
        description: "API version (e.g., 1, 2)",
      },
      "api-version",
    )
    .addTag("Auth", "Authentication and authorization")
    .addTag("Tasks", "Task management and collaboration")
    .addTag("Worklogs", "Worklog tracking and timer")
    .addTag("Calendar", "Calendar events and sync")
    .addTag("Analytics", "Operational analytics and insights")
    .addTag("AI", "AI-generated insights and recommendations")
    .addTag("Notifications", "In-app notifications")
    .addTag("Files", "File attachments and uploads")
    .addTag("Subsystems", "Subsystem management")
    .addTag("Users", "User management and roles")
    .addTag("Resources", "Resource allocation and planning")
    .addTag("Meetings", "Meeting automation and agendas")
    .addTag("Decisions", "Decision log (ADR-lite)")
    .addTag("Reports", "Handoff packages and reports")
    .addTag("Audit", "Audit logging")
    .addTag("Health", "Health checks and monitoring")
    .addTag("Metrics", "Prometheus metrics")
    .addServer("http://localhost:4000/api", "Development")
    .addServer("https://api.antaraerp.com/api", "Production")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { color: #1e293b; font-weight: 700; }
      .swagger-ui .scheme-container { background: #f8fafc; border-radius: 8px; padding: 16px; }
    `,
    customSiteTitle: "ANTARA ERP API Documentation",
  });

  // Also serve raw OpenAPI JSON
  const rawDocument = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle("ANTARA ERP API")
    .setVersion("1.0.0")
    .build());
  SwaggerModule.setup("api/docs-json", app, rawDocument, {
    swaggerOptions: { jsonOnly: true },
  });
}