import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApiMetaDto {
  @ApiProperty({ type: String, example: "4df0d9de-86d1-4d16-a89b-56db6abf4af5" })
  traceId!: string;

  @ApiProperty({ type: String, example: "2026-06-29T00:00:00.000Z" })
  timestamp!: string;
}

export class PageMetaDto {
  @ApiProperty({ type: Number, example: 1 })
  page!: number;

  @ApiProperty({ type: Number, example: 20 })
  limit!: number;

  @ApiProperty({ type: Number, example: 37 })
  totalItems!: number;

  @ApiProperty({ type: Number, example: 2 })
  totalPages!: number;

  @ApiProperty({ type: Boolean, example: true })
  hasNext!: boolean;
}

export class ApiListMetaDto extends ApiMetaDto {
  @ApiProperty({ type: PageMetaDto })
  page!: PageMetaDto;
}

export class ApiSuccessEnvelopeDto<TData = unknown> {
  @ApiProperty({ type: Object, description: "API별 실제 응답 데이터" })
  data!: TData;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class ApiListDataDto<TItem = unknown> {
  @ApiProperty({ type: [Object], description: "목록 아이템" })
  items!: TItem[];
}

export class ApiListEnvelopeDto<TItem = unknown> {
  @ApiProperty({ type: ApiListDataDto })
  data!: ApiListDataDto<TItem>;

  @ApiProperty({ type: ApiListMetaDto })
  meta!: ApiListMetaDto;
}

export class ApiErrorBodyDto {
  @ApiProperty({ type: String, example: "COMMON_VALIDATION_FAILED" })
  code!: string;

  @ApiProperty({ type: String, example: "입력값을 확인해주세요." })
  message!: string;

  @ApiProperty({ type: [Object], example: [{ field: "email", reason: "INVALID_FORMAT" }] })
  details!: Array<Record<string, unknown>>;
}

export class ApiErrorEnvelopeDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error!: ApiErrorBodyDto;

  @ApiProperty({ type: ApiMetaDto })
  meta!: ApiMetaDto;
}

export class CurrentUserResponseDto {
  @ApiProperty({ type: Number, example: 1 })
  userId!: number;

  @ApiProperty({ enum: ["ADMIN", "COMPANY", "CANDIDATE"], example: "COMPANY" })
  userType!: "ADMIN" | "COMPANY" | "CANDIDATE";

  @ApiPropertyOptional({ type: Number, nullable: true, example: 1 })
  companyId?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: null })
  candidateId?: number | null;

  @ApiPropertyOptional({ type: String, example: "dev-company@example.com" })
  email?: string;

  @ApiPropertyOptional({ type: String, example: "DEV_COMPANY_USER" })
  name?: string;
}
