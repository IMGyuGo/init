CREATE UNIQUE INDEX "uk_candidate_mock_pass_free_signup"
    ON "candidate_mock_interview_pass_ledgers"("candidate_id", "source")
    WHERE "source" = 'FREE_SIGNUP';
