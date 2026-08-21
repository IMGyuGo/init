# API ECS Autoscaling and 200-User Load Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API ECS 서비스에 CPU 기반 1~3개 오토스케일링을 Terraform으로 적용하고, 정확히 동기화된 50·100·200명 부하 테스트로 용량과 장애 증거를 검증한다.

**Architecture:** 기존 ECS API 서비스 상태를 별도 Terraform 리소스 주소로 안전하게 이동해 API desired count만 오토스케일러가 소유하게 한다. Application Auto Scaling target/policy는 CPU 60%를 추적하며, 실제 시험 중에는 컨트롤러가 최소·최대를 3/3으로 잠시 고정하고 모든 종료 경로에서 1/3으로 복원한다. nGrinder VU는 파일로 전달된 UTC barrier를 직접 기다려 Playwright와 5초 안에 시작한다.

**Tech Stack:** Terraform 1.15.8, HashiCorp AWS Provider 6.x, AWS ECS Fargate, Application Auto Scaling, PowerShell 5.1, nGrinder Groovy, Playwright/Node.js 20.

## Global Constraints

- 오토스케일링은 `api` ECS 서비스에만 적용한다.
- 운영값은 최소 1, 최대 3, CPU 목표 60%, scale-out cooldown 60초, scale-in cooldown 300초다.
- Terraform plan에 삭제 또는 교체가 하나라도 있으면 apply하지 않는다.
- 시험 중 API를 3개로 유지하고 성공·실패와 관계없이 scalable target을 1/3으로 복원한다.
- API와 브라우저 첫 실제 요청은 같은 UTC barrier 이후, 서로 5초 이내여야 한다.
- ALB/target 5xx, 연결 오류, ECS task 이상, API CPU 99% 포화 또는 필수 증거 누락 시 다음 단계로 진행하지 않는다.
- 기존 결과, S3 객체, 사용자 변경 파일을 덮어쓰거나 삭제하지 않는다.
- 자격증명, token, task ARN은 로그·요약·커밋에 포함하지 않는다.

---

### Task 1: Terraform API Autoscaling Contract

**Files:**
- Create: `tools/realtime-playwright/tests/unit/api-autoscaling-contract.spec.ts`

**Interfaces:**
- Consumes: Terraform source files under `infra/aws`.
- Produces: static contract proving API-only min/max/CPU/cooldown resources and a scoped desired-count lifecycle.

- [ ] **Step 1: Write the failing contract test**

Create assertions that read `variables.tf`, `ecs.tf`, `ecs-autoscaling.tf`, `outputs.tf`, and `env/main.tfvars` and require:

```ts
expect(autoscaling).toContain('resource "aws_appautoscaling_target" "api"');
expect(autoscaling).toContain('scalable_dimension = "ecs:service:DesiredCount"');
expect(autoscaling).toContain('predefined_metric_type = "ECSServiceAverageCPUUtilization"');
expect(tfvars).toMatch(/min_capacity\s*=\s*1/);
expect(tfvars).toMatch(/max_capacity\s*=\s*3/);
expect(tfvars).toMatch(/cpu_target_percent\s*=\s*60/);
expect(tfvars).toMatch(/scale_out_cooldown_seconds\s*=\s*60/);
expect(tfvars).toMatch(/scale_in_cooldown_seconds\s*=\s*300/);
expect(ecs).toMatch(/resource "aws_ecs_service" "api"[\s\S]*ignore_changes = \[task_definition, desired_count\]/);
expect(ecs).toMatch(/moved[\s\S]*aws_ecs_service\.service\["api"\][\s\S]*aws_ecs_service\.api/);
expect(ecs).toMatch(/for name, service in local\.services : name => service if name != "api"/);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx playwright test tests/unit/api-autoscaling-contract.spec.ts --workers=1
```

Expected: FAIL because `ecs-autoscaling.tf` and the API-specific service resource do not exist.

- [ ] **Step 3: Commit the failing test with the implementation in Task 2, not separately**

The red test remains uncommitted until Task 2 turns it green.

### Task 2: Terraform API Service and Target Tracking Policy

**Files:**
- Modify: `infra/aws/variables.tf`
- Modify: `infra/aws/env/main.tfvars`
- Modify: `infra/aws/ecs.tf`
- Create: `infra/aws/ecs-autoscaling.tf`
- Modify: `infra/aws/cloudwatch.tf`
- Modify: `infra/aws/outputs.tf`
- Test: `tools/realtime-playwright/tests/unit/api-autoscaling-contract.spec.ts`

**Interfaces:**
- Consumes: `var.api_autoscaling`, `aws_ecs_cluster.app`, `aws_ecs_service.api`.
- Produces: `aws_appautoscaling_target.api`, `aws_appautoscaling_policy.api_cpu`, and `output.api_autoscaling`.

- [ ] **Step 1: Add the validated variable**

Add this object to `variables.tf`:

```hcl
variable "api_autoscaling" {
  description = "API ECS Service Auto Scaling target tracking settings."
  type = object({
    min_capacity               = number
    max_capacity               = number
    cpu_target_percent         = number
    scale_out_cooldown_seconds = number
    scale_in_cooldown_seconds  = number
  })

  validation {
    condition = (
      floor(var.api_autoscaling.min_capacity) == var.api_autoscaling.min_capacity &&
      floor(var.api_autoscaling.max_capacity) == var.api_autoscaling.max_capacity &&
      var.api_autoscaling.min_capacity >= 1 &&
      var.api_autoscaling.max_capacity >= var.api_autoscaling.min_capacity &&
      var.api_autoscaling.max_capacity <= 3 &&
      var.api_autoscaling.cpu_target_percent > 0 &&
      var.api_autoscaling.cpu_target_percent <= 100 &&
      floor(var.api_autoscaling.scale_out_cooldown_seconds) == var.api_autoscaling.scale_out_cooldown_seconds &&
      floor(var.api_autoscaling.scale_in_cooldown_seconds) == var.api_autoscaling.scale_in_cooldown_seconds &&
      var.api_autoscaling.scale_out_cooldown_seconds >= 0 &&
      var.api_autoscaling.scale_in_cooldown_seconds >= 0
    )
    error_message = "api_autoscaling must use min>=1, min<=max<=3, CPU 1..100, and non-negative integer cooldowns."
  }
}
```

- [ ] **Step 2: Set exact production values**

Add to `env/main.tfvars`:

```hcl
api_autoscaling = {
  min_capacity               = 1
  max_capacity               = 3
  cpu_target_percent         = 60
  scale_out_cooldown_seconds = 60
  scale_in_cooldown_seconds  = 300
}
```

- [ ] **Step 3: Move only the API ECS service to a scoped resource**

Change the existing service `for_each` to exclude `api`, copy the existing service definition to `resource "aws_ecs_service" "api"`, replace `each.key` with `"api"` and `each.value` with `local.services.api`, and use:

```hcl
lifecycle {
  ignore_changes = [task_definition, desired_count]
}

moved {
  from = aws_ecs_service.service["api"]
  to   = aws_ecs_service.api
}
```

Keep frontend and worker on the original resource with `ignore_changes = [task_definition]`. Update CloudWatch and outputs so API references `aws_ecs_service.api.name` while frontend/worker retain their current addresses.

- [ ] **Step 4: Add Application Auto Scaling resources**

Create `ecs-autoscaling.tf`:

```hcl
resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_autoscaling.max_capacity
  min_capacity       = var.api_autoscaling.min_capacity
  resource_id        = "service/${aws_ecs_cluster.app.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name_prefix}-api-cpu-target"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_autoscaling.cpu_target_percent
    scale_out_cooldown = var.api_autoscaling.scale_out_cooldown_seconds
    scale_in_cooldown  = var.api_autoscaling.scale_in_cooldown_seconds

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
```

- [ ] **Step 5: Add a safe output**

Add only non-sensitive fields:

```hcl
output "api_autoscaling" {
  value = {
    resource_id                = aws_appautoscaling_target.api.resource_id
    min_capacity               = aws_appautoscaling_target.api.min_capacity
    max_capacity               = aws_appautoscaling_target.api.max_capacity
    cpu_target_percent         = var.api_autoscaling.cpu_target_percent
    scale_out_cooldown_seconds = var.api_autoscaling.scale_out_cooldown_seconds
    scale_in_cooldown_seconds  = var.api_autoscaling.scale_in_cooldown_seconds
  }
}
```

- [ ] **Step 6: Run GREEN checks**

Run the focused Playwright test, `terraform fmt -check -recursive`, `terraform validate`, and the existing Terraform mock test. Expected: all exit 0.

- [ ] **Step 7: Commit**

```powershell
git add infra/aws/variables.tf infra/aws/env/main.tfvars infra/aws/ecs.tf infra/aws/ecs-autoscaling.tf infra/aws/cloudwatch.tf infra/aws/outputs.tf tools/realtime-playwright/tests/unit/api-autoscaling-contract.spec.ts
git commit -m "feat(infra): API ECS 오토스케일링 추가"
```

### Task 3: Exact UTC Barrier for nGrinder

**Files:**
- Modify: `tools/realtime-playwright/ngrinder/hybrid-interview.groovy`
- Modify: `scripts/hybrid-loadtest.ps1`
- Modify: `tools/realtime-playwright/src/ngrinder-contract.mjs`
- Modify: `tools/realtime-playwright/tests/realtime-session-hold.spec.ts`
- Modify: `tools/realtime-playwright/src/hybrid-summary.mjs`
- Modify: `tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts`
- Modify: `tools/realtime-playwright/tests/unit/hybrid-summary.spec.ts`
- Modify: `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts`

**Interfaces:**
- Consumes: `BarrierEpoch` from `Invoke-HybridStage`.
- Produces: `/var/lib/ngrinder/hybrid-results/current/start-at-epoch`, `startedAtEpochMs` in safe API/browser VU results, and summary barrier evidence.

- [ ] **Step 1: Write RED tests**

Require the controller to pass `BarrierEpoch` into `Initialize-NgrinderAttempt`, install an integer epoch file in the attempt directory, and require Groovy to read it and sleep until `barrier * 1000`. Extend the nGrinder and browser result contracts so all `startedAtEpochMs` values must be at or after the barrier. Extend the hybrid summary contract to reject API/browser first-start skew above 5,000ms.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx playwright test tests/unit/ngrinder-contract.spec.ts tests/unit/hybrid-orchestration.spec.ts --workers=1
```

Expected: barrier-file and timestamp assertions fail.

- [ ] **Step 3: Implement the barrier**

Compute `$barrierEpoch` before attempt initialization and call:

```powershell
Initialize-NgrinderAttempt -StageUsers $StageUsers -BarrierEpoch $barrierEpoch
```

The remote initialization command writes `$BarrierEpoch` to `$attempt_dir/start-at-epoch` with owner `ngrinder`, mode `0600`. In Groovy `beforeProcess`, parse the file as an integer. At the beginning of `beforeThread`, wait when `barrierEpochMs - System.currentTimeMillis() > 0`, reject starts over 30 seconds late, then set `startedAtEpochMs = System.currentTimeMillis()` immediately before the first API request.

- [ ] **Step 4: Preserve only safe timing evidence**

Add `startedAtEpochMs` to both API and browser VU JSON. Aggregate only API/browser minimum/maximum timestamps, barrier lateness, and cross-generator `startSkewMs`; do not add URL, token, application ID, task ARN, or credential fields.

- [ ] **Step 5: Run GREEN tests and commit**

Run the focused tests and full unit suite, then commit:

```powershell
git add scripts/hybrid-loadtest.ps1 tools/realtime-playwright/ngrinder/hybrid-interview.groovy tools/realtime-playwright/src/ngrinder-contract.mjs tools/realtime-playwright/tests/realtime-session-hold.spec.ts tools/realtime-playwright/src/hybrid-summary.mjs tools/realtime-playwright/tests/unit/ngrinder-contract.spec.ts tools/realtime-playwright/tests/unit/hybrid-summary.spec.ts tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts
git commit -m "fix(loadtest): nGrinder UTC barrier 동기화"
```

### Task 4: API Three-Task Prewarm and Guaranteed Restore

**Files:**
- Modify: `scripts/hybrid-loadtest.ps1`
- Modify: `tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts`

**Interfaces:**
- Consumes: Terraform output `api_autoscaling.resource_id`, cluster/service names, and API target group.
- Produces: `Set-ApiLoadtestCapacity`, `Wait-ApiLoadtestCapacity`, and a `try/finally` around all non-canary Run stages.

- [ ] **Step 1: Write RED orchestration assertions**

Require source patterns for:

```text
register-scalable-target min=3 max=3
wait services-stable
three running API tasks
three healthy API targets
finally restore min=1 max=3
```

Also assert that restoration is attempted even when a stage throws.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: the prewarm and restoration assertions fail.

- [ ] **Step 3: Implement capacity helpers**

`Set-ApiLoadtestCapacity -Context $context -Minimum 3 -Maximum 3` calls Application Auto Scaling with the exact Terraform resource ID. `Wait-ApiLoadtestCapacity` waits for ECS stability, then requires desired/running/pending `3/3/0` and exactly three healthy target descriptions. Return a safe object containing counts only.

- [ ] **Step 4: Wrap Run in guaranteed restoration**

The `Run` action performs prewarm after canary evidence validation. Put all stages in `try` and call this in `finally`:

```powershell
Set-ApiLoadtestCapacity -Context $context -Minimum 1 -Maximum 3
```

If restoration fails, throw `API_AUTOSCALING_RESTORE_FAILED` after preserving the original stage failure as a fixed safe code.

- [ ] **Step 5: Run tests and commit**

```powershell
git add scripts/hybrid-loadtest.ps1 tools/realtime-playwright/tests/unit/hybrid-orchestration.spec.ts
git commit -m "feat(loadtest): API 3태스크 사전 기동 추가"
```

### Task 5: Terraform Plan Review and Production Apply

**Files:**
- Create runtime-only: `.codex-tmp/api-autoscaling.tfplan`
- Create evidence: `D:\jungleCamp\loadtest-results\autoscaling\<timestamp>\terraform-plan-summary.json`

**Interfaces:**
- Consumes: committed Terraform configuration and existing backend/provider credentials.
- Produces: applied target tracking policy with read-back evidence.

- [ ] **Step 1: Initialize and validate**

Use `.tools/terraform-1.15.8/terraform.exe`, the already initialized `.terraform` S3 backend, AWS profile `init-main`, and `-var-file=env/main.tfvars`. Confirm `terraform state list` and `terraform providers` first. Because `backend-main.hcl` is not present in this worktree, do not run `init -reconfigure` with invented backend values; stop if the initialized backend cannot read state. Run `fmt -check -recursive`, `validate`, and `test`.

- [ ] **Step 2: Create a saved plan**

```powershell
$planPath = 'D:\jungleCamp\Projects\나만무파일정리\init\.worktrees\playwright-distributed-loadtest\.codex-tmp\api-autoscaling.tfplan'
terraform -chdir=infra/aws plan -var-file=env/main.tfvars "-out=$planPath"
terraform -chdir=infra/aws show -json $planPath
```

Normalize the JSON to action counts and resource addresses. Stop if any action contains `delete`, `replace`, or changes outside the API service move, autoscaling target/policy, and safe output.

- [ ] **Step 3: Apply only the reviewed plan**

```powershell
terraform -chdir=infra/aws apply $planPath
```

- [ ] **Step 4: Read back AWS state**

Verify scalable target `MinCapacity=1`, `MaxCapacity=3`, policy target `60`, cooldowns `60/300`, API desired/running `1/1`, and healthy ALB target count `1`. Save only aggregate evidence.

### Task 6: Fresh Fixture, Canary, and Staged 200-User Run

**Files:**
- Create runtime-only: `.codex-tmp/invoke-hybrid-autoscaled.ps1`
- Create evidence under: `D:\jungleCamp\loadtest-results\continuations\autoscaled-<timestamp>`

**Interfaces:**
- Consumes: applied API autoscaling, stored DPAPI nGrinder credential, fresh fixture tokens.
- Produces: canary and 50/100/200 stage summaries, ECS scaling evidence, AWS PNG graphs, and restoration evidence.

- [ ] **Step 1: Create a fresh run and fixture**

Generate unique `run-YYYYMMDD-autoscaled01` and `pwload-YYYYMMDD-autoscaled01` identifiers. Run fixture plan/apply and require 200 valid rows with four-hour TTL. Never print token values.

- [ ] **Step 2: Run attempt-1 canary**

Require API summary PASSED, CloudWatch metrics complete, ALB/target 5xx zero, and barrier timing valid.

- [ ] **Step 3: Run 50, 100, 200 sequentially**

The Run action prewarms API to 3/3, waits for three healthy targets, then executes stages in order. After each stage, require no server failure, no task anomaly, CPU below 99%, and complete evidence before continuing.

- [ ] **Step 4: Confirm guaranteed restoration**

After success or failure, read the scalable target and require min/max `1/3`. Record current desired/running counts and the latest scaling activity without task identifiers.

- [ ] **Step 5: Verify and report**

Run the full 122+ unit suite, PowerShell parser, `terraform validate`, `git diff --check`, and verify AWS PNG signatures/hashes. Report each stage's users completed, API p95, API CPU/memory max, ALB 5xx, ECS task anomalies, task count changes, and whether 200 users passed.
