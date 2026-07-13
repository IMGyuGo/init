-- 지원서 세트에 포트폴리오 PDF 첨부 지원(#272 P1-2). 이력서(resume_file_id)와 대칭.
ALTER TABLE "candidate_folders" ADD COLUMN "portfolio_file_id" BIGINT;

ALTER TABLE "candidate_folders"
  ADD CONSTRAINT "candidate_folders_portfolio_file_id_fkey"
  FOREIGN KEY ("portfolio_file_id") REFERENCES "file_assets"("file_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
