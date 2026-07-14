-- 연습 이력(모의면접 세션)에 사용자 지정 제목 추가(#288). 없으면 '세션 #N'으로 표시.
ALTER TABLE "interview_sessions" ADD COLUMN "title" VARCHAR(100);
