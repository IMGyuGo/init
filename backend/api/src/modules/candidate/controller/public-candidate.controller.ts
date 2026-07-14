import { Controller, Get, Inject, Query } from "@nestjs/common";
import { CandidateJobListQueryDto } from "../dto/candidate-job-list-query.dto";
import { publicCandidateApiRoutePrefix, publicCandidateApiRoutes } from "../candidate.routes";
import { CandidateService } from "../service/candidate.service";

@Controller(publicCandidateApiRoutePrefix)
export class PublicCandidateController {
  constructor(@Inject(CandidateService) private readonly candidateService: CandidateService) {}

  @Get(publicCandidateApiRoutes.jobs)
  listJobs(@Query() query: CandidateJobListQueryDto) {
    return this.candidateService.listJobs(query);
  }
}
