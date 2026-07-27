import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiEnvelopeResponse } from "../../../swagger/swagger.decorators";
import { HealthResponseDto } from "../dto/health-response.dto";

@ApiTags("Health")
@Controller()
export class HealthController {
  @Get("health")
  @ApiOperation({ summary: "API 서버 상태 확인" })
  @ApiEnvelopeResponse(HealthResponseDto)
  health() {
    return { status: "ok" };
  }
}
