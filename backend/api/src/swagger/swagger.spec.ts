import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { ApiExceptionFilter } from "../shared/api-exception.filter";
import { ApiResponseInterceptor } from "../shared/api-response.interceptor";
import { PrismaService } from "../shared/prisma.service";
import { setupSwagger } from "./swagger";

describe("Swagger setup", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves OpenAPI JSON for currently implemented API routes only", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const paths = Object.keys(response.body.paths);

    expect(response.body.info.title).toBe("Final Weapon API");
    expect(paths).toContain("/api/v1/health");
    expect(paths).toContain("/api/v1/auth/login");
    expect(paths).toContain("/api/v1/company/profile");
    expect(paths).toContain("/api/v1/company/profile/logo");
    expect(paths).toContain("/api/v1/company/recruitments");
    expect(paths).toContain("/api/v1/company/recruitments/jd-images");
    expect(paths).toContain("/api/v1/candidate/jobs");
    expect(paths).toContain("/api/v1/candidate/mock-interview/reports");
    expect(paths).toContain("/api/v1/reports/{reportId}/generate");
    expect(paths).toContain("/api/v1/ai/guardrails/validate");
  });

  it("documents JD image uploads as multipart file requests", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const uploadImage = response.body.paths["/api/v1/company/recruitments/jd-images"].post;

    expect(uploadImage["x-api-id"]).toBe("API-086");
    expect(uploadImage.requestBody.content["multipart/form-data"].schema.properties.file).toEqual(
      expect.objectContaining({ type: "string", format: "binary" }),
    );
  });

  it("documents company logo uploads as multipart file requests", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const uploadLogo = response.body.paths["/api/v1/company/profile/logo"].post;

    expect(uploadLogo["x-api-id"]).toBe("API-042");
    expect(uploadLogo.requestBody.content["multipart/form-data"].schema.properties.file).toEqual(
      expect.objectContaining({ type: "string", format: "binary" }),
    );
  });

  it("documents bearer auth and local dev auth headers", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const securitySchemes = response.body.components.securitySchemes;

    expect(securitySchemes.bearer).toEqual(expect.objectContaining({ type: "http", scheme: "bearer" }));
    expect(securitySchemes["x-dev-user-id"]).toEqual(expect.objectContaining({ type: "apiKey", in: "header" }));
    expect(securitySchemes["x-dev-user-type"]).toEqual(expect.objectContaining({ type: "apiKey", in: "header" }));
  });

  it("documents dev auth security for report generation APIs", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const recruitingGenerate = response.body.paths["/api/v1/reports/{reportId}/generate"].post;
    const mockGenerate = response.body.paths["/api/v1/candidate/mock-interview/reports/{reportId}/generate"].post;
    const devHeaderNames = ["X-Dev-User-Id", "X-Dev-User-Type", "X-Dev-Company-Id", "X-Dev-Candidate-Id"];

    expect(recruitingGenerate.security).toContainEqual(
      expect.objectContaining({
        "x-dev-user-id": [],
        "x-dev-user-type": [],
        "x-dev-company-id": [],
      }),
    );
    expect(mockGenerate.security).toContainEqual(
      expect.objectContaining({
        "x-dev-user-id": [],
        "x-dev-user-type": [],
        "x-dev-candidate-id": [],
      }),
    );
    for (const headerName of devHeaderNames) {
      expect((recruitingGenerate.parameters ?? []).map((parameter: { name: string }) => parameter.name)).not.toContain(headerName);
      expect((mockGenerate.parameters ?? []).map((parameter: { name: string }) => parameter.name)).not.toContain(headerName);
    }
  });

  it("documents protected interviewer preview auth and errors without overwriting the public realtime summary", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const preview = response.body.paths["/api/v1/interviewer-preview/realtime-session"].post;
    const publicRealtime = response.body.paths["/api/v1/public/interviews/{sessionId}/realtime-session"].post;
    const previewHeaderNames = (preview.parameters ?? []).map(
      (parameter: { name: string }) => parameter.name,
    );

    expect(preview["x-api-id"]).toBe("API-097-RT");
    expect(preview.summary).toBe("면접관 립싱크 튜닝용 실시간 AI 세션 생성");
    expect(preview.security).toContainEqual({ bearer: [] });
    expect(previewHeaderNames).toEqual(expect.arrayContaining([
      "X-Dev-User-Id",
      "X-Dev-User-Type",
      "X-Dev-Company-Id",
      "X-Dev-Candidate-Id",
    ]));
    for (const status of ["400", "401", "403", "404"]) {
      expect(preview.responses[status]).toEqual(expect.objectContaining({
        description: expect.any(String),
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiErrorEnvelopeDto" },
          },
        },
      }));
    }
    expect(publicRealtime.summary).toBe("비회원 채용면접 실시간 AI 세션 생성");
    expect(publicRealtime.summary).not.toBe(preview.summary);
  });

  it("documents descriptions for operations, parameters, responses, request bodies, and schema properties", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const missingDescriptions = collectMissingSwaggerDescriptions(response.body);

    expect(missingDescriptions).toEqual({
      operations: [],
      parameters: [],
      responses: [],
      requestBodies: [],
      schemaProperties: [],
      inlineProperties: [],
    });
  });

  it("documents every operation with a meaningful summary and detailed description", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const weakOperations = collectWeakSwaggerOperations(response.body);

    expect(weakOperations).toEqual({
      missingSummaries: [],
      routeFallbackSummaries: [],
      shortDescriptions: [],
    });
  });

  it("keeps explicit operation summaries isolated from same-named controller handlers", async () => {
    const response = await request(app.getHttpServer()).get("/api-docs-json").expect(200);
    const performanceJobs = response.body.paths["/api/v1/ai/performance/jobs"].get;

    expect(performanceJobs.summary).toBe("AI process performance jobs");
    expect(performanceJobs.description).toContain("AI process performance jobs");
    expect(performanceJobs.description).not.toContain("채용공고");
  });
});

function collectWeakSwaggerOperations(document: {
  paths?: Record<string, Record<string, Record<string, unknown>>>;
}) {
  const weak = {
    missingSummaries: [] as string[],
    routeFallbackSummaries: [] as string[],
    shortDescriptions: [] as string[],
  };

  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!isHttpMethod(method)) {
        continue;
      }

      const label = `${method.toUpperCase()} ${path}`;
      const summary = typeof operation.summary === "string" ? operation.summary.trim() : "";
      const description = typeof operation.description === "string" ? operation.description.trim() : "";
      if (!summary) {
        weak.missingSummaries.push(label);
      }
      if (summary === label) {
        weak.routeFallbackSummaries.push(label);
      }
      if (description.length < 30) {
        weak.shortDescriptions.push(label);
      }
    }
  }

  return weak;
}

function collectMissingSwaggerDescriptions(document: {
  paths?: Record<string, Record<string, Record<string, unknown>>>;
  components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
}) {
  const missing = {
    operations: [] as string[],
    parameters: [] as string[],
    responses: [] as string[],
    requestBodies: [] as string[],
    schemaProperties: [] as string[],
    inlineProperties: [] as string[],
  };

  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!isHttpMethod(method)) {
        continue;
      }

      const label = `${method.toUpperCase()} ${path}`;
      if (!hasDescription(operation)) {
        missing.operations.push(label);
      }

      const parameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      for (const parameterValue of parameters) {
        const parameter = asSwaggerObject(parameterValue);
        if (parameter && !hasDescription(parameter)) {
          missing.parameters.push(`${label} param:${String(parameter.name)}`);
        }
      }

      const requestBody = asSwaggerObject(operation.requestBody);
      if (requestBody && !hasDescription(requestBody)) {
        missing.requestBodies.push(label);
      }

      const responses = asSwaggerObject(operation.responses);
      for (const [status, responseValue] of Object.entries(responses ?? {})) {
        const apiResponse = asSwaggerObject(responseValue);
        if (apiResponse && !hasDescription(apiResponse)) {
          missing.responses.push(`${label} response:${status}`);
        }
      }

      for (const [contentType, media] of Object.entries(asSwaggerObject(requestBody?.content) ?? {})) {
        collectInlinePropertyDescriptions(
          asSwaggerObject(asSwaggerObject(media)?.schema),
          `${label} requestBody:${contentType}`,
          missing.inlineProperties,
        );
      }

      for (const [status, responseValue] of Object.entries(responses ?? {})) {
        const apiResponse = asSwaggerObject(responseValue);
        for (const [contentType, media] of Object.entries(asSwaggerObject(apiResponse?.content) ?? {})) {
          collectInlinePropertyDescriptions(
            asSwaggerObject(asSwaggerObject(media)?.schema),
            `${label} response:${status}:${contentType}`,
            missing.inlineProperties,
          );
        }
      }
    }
  }

  for (const [schemaName, schema] of Object.entries(document.components?.schemas ?? {})) {
    for (const [propertyName, propertyValue] of Object.entries(schema.properties ?? {})) {
      const property = asSwaggerObject(propertyValue);
      if (property && !hasDescription(property)) {
        missing.schemaProperties.push(`${schemaName}.${propertyName}`);
      }
    }
  }

  return missing;
}

function collectInlinePropertyDescriptions(schema: Record<string, unknown> | undefined, location: string, missing: string[]) {
  if (!schema) {
    return;
  }

  const properties = asSwaggerObject(schema.properties);
  for (const [propertyName, propertyValue] of Object.entries(properties ?? {})) {
    const property = asSwaggerObject(propertyValue);
    if (property && !hasDescription(property)) {
      missing.push(`${location}.${propertyName}`);
    }
    collectInlinePropertyDescriptions(property, `${location}.${propertyName}`, missing);
  }

  collectInlinePropertyDescriptions(asSwaggerObject(schema.items), `${location}[]`, missing);

  for (const unionKey of ["allOf", "oneOf", "anyOf"]) {
    const unionSchemas = schema[unionKey];
    if (!Array.isArray(unionSchemas)) {
      continue;
    }

    unionSchemas.forEach((child, index) => {
      collectInlinePropertyDescriptions(asSwaggerObject(child), `${location}.${unionKey}[${index}]`, missing);
    });
  }
}

function hasDescription(value: Record<string, unknown>) {
  return typeof value.description === "string" && value.description.trim().length > 0;
}

function asSwaggerObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isHttpMethod(method: string) {
  return ["get", "post", "put", "patch", "delete", "options", "head", "trace"].includes(method);
}
