import { IsString, MaxLength } from "class-validator";

// 연습 이력(모의면접 세션) 사용자 지정 제목. 빈 문자열이면 기본 '세션 #N' 으로 되돌린다. (#288)
export class UpdateMockSessionTitleDto {
  @IsString()
  @MaxLength(100)
  title!: string;
}
