import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateCandidateProfileDto } from "./update-candidate-profile.dto";

const options = { whitelist: true, forbidNonWhitelisted: true } as const;

test("candidate profile DTO accepts structured profile arrays", async () => {
  const dto = plainToInstance(UpdateCandidateProfileDto, {
    educations: [{
      educationLevel: "UNIVERSITY",
      schoolName: "정글대학교",
      major: "컴퓨터공학",
      degreeType: "BACHELOR",
      status: "GRADUATED",
      startMonth: "2020-03",
      endMonth: "2024-02",
    }],
  });
  expect(await validate(dto, options)).toHaveLength(0);
});

test("candidate profile DTO rejects null arrays, email writes, and null name", async () => {
  for (const body of [
    { careers: null },
    { email: "changed@example.com" },
    { name: null },
    { activities: [{ activityType: "CLUB", organizationName: "동아리", startDate: "2024-02-31", endDate: "2024-03-01", isOngoing: false, description: "활동" }] },
  ]) {
    const errors = await validate(plainToInstance(UpdateCandidateProfileDto, body), options);
    expect(errors.length).toBeGreaterThan(0);
  }
});
