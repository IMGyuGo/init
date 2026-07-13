-- 지원자 프로필에 블로그 URL 추가(#272 프로필 정본화). GitHub/포트폴리오와 동일 층위.
ALTER TABLE "candidate_profiles" ADD COLUMN "blog_url" VARCHAR(500);
