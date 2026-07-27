import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { enrichSwaggerDescriptions } from "./swagger-description-enricher";

export function createSwaggerDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Final Weapon API")
    .setDescription("현재 NestJS API 서버에 실제 구현된 엔드포인트 문서입니다.")
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Authorization: Bearer {accessToken}",
      },
      "bearer",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-Dev-User-Id",
        in: "header",
        description: "local/dev 임시 사용자 ID",
      },
      "x-dev-user-id",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-Dev-User-Type",
        in: "header",
        description: "ADMIN, COMPANY, CANDIDATE",
      },
      "x-dev-user-type",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-Dev-Company-Id",
        in: "header",
        description: "기업 사용자 local/dev 회사 ID",
      },
      "x-dev-company-id",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-Dev-Candidate-Id",
        in: "header",
        description: "지원자 사용자 local/dev 후보자 ID",
      },
      "x-dev-candidate-id",
    )
    .addCookieAuth("refreshToken", {
      type: "apiKey",
      in: "cookie",
      name: "refreshToken",
      description: "HttpOnly refresh token cookie",
    })
    .build();

  return enrichSwaggerDescriptions(SwaggerModule.createDocument(app, config));
}

export function setupSwagger(app: INestApplication) {
  const document = createSwaggerDocument(app);
  SwaggerModule.setup("api-docs", app, document, {
    jsonDocumentUrl: "api-docs-json",
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });
}
