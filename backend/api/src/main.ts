import "reflect-metadata";
import cookieParser from "cookie-parser";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/app.module";
import { ApiExceptionFilter } from "./shared/api-exception.filter";
import { createApiValidationException } from "./shared/api-validation";
import { ApiResponseInterceptor } from "./shared/api-response.interceptor";
import { createCorsOriginDelegate } from "./shared/cors-origin";
import { setupSwagger } from "./swagger/swagger";
import { InterviewService } from "./modules/interview/service/interview.service";
import { attachRealtimeSttRelayServer } from "./modules/interview/realtime-stt-relay.server";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.enableCors({
    origin: createCorsOriginDelegate(),
    credentials: true,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Dev-User-Id",
      "X-Dev-User-Type",
      "X-Dev-Company-Id",
      "X-Dev-Candidate-Id",
    ],
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: createApiValidationException,
    }),
  );
  if (process.env.DISABLE_SWAGGER !== "true") {
    try {
      setupSwagger(app);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Logger("Swagger").warn(`Swagger setup skipped: ${message}`);
    }
  }

  attachRealtimeSttRelayServer(app.getHttpServer(), {
    interviewService: app.get(InterviewService),
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
