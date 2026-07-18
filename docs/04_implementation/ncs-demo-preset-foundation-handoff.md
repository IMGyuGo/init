# NCS Demo Preset Foundation Handoff

## Foundation Baseline

- WT1 branch: `feat/ncs-demo-preset-foundation`
- downstream branches must start from the final WT1 commit, not directly from `origin/dev`
- contract: [`ncs-active-profile-demo-preset-foundation.md`](../03_contracts/ncs-active-profile-demo-preset-foundation.md)
- framework: `LEGACY | NCS_3_PROFILE_V1 | NCS_ACTIVE_PROFILE_V2`
- session mode: `STANDARD | DEMO_PRESET`
- usage scope: `STANDARD | DEMO_PRESET`
- readiness: `READY | PENDING | UNAVAILABLE`

WT2~WT4는 Foundation의 Prisma schema/migration, shared enum/error/DTO, error code와 field 이름을 독립적으로 바꾸지 않는다. 계약 변경이 필요하면 WT1에 follow-up commit을 먼저 추가하고 모두 같은 새 Foundation commit으로 rebase한다.

## Fixed Shared Names

### DB columns

| Table | Column | Default / role |
| --- | --- | --- |
| `interview_sessions` | `session_mode` | `STANDARD`, official selection snapshot |
| `question_bank` | `usage_scope` | `STANDARD`, question source purpose |
| `application_interview_question_batches` | `usage_scope` | `STANDARD`, batch business scope |
| `application_interview_questions` | `usage_scope` | `STANDARD`, personalized slot scope |
| `interview_session_questions` | `usage_scope` | `STANDARD`, session consumption scope |

Batch business key:

```text
application_id + usage_scope + policy_version + criteria_version
+ jd_snapshot_hash + resume_document_hash
```

### API fields

| Boundary | Fixed fields |
| --- | --- |
| API-034/036 | `evaluationFramework`, `criteriaVersion`, `criteria[].weight`, derived `criteria[].isActive`, `configurationLocked`, `configurationLockedReason`, `questionImpactByProfile[]`, `questionSetRequiresReconfirmation` |
| API-097 | STANDARD counts, `activeProfileCoverage[]`, `questionSetRequiresReconfirmation` |
| API-061/062 | `demoPreset.{status,canStart,reasonCode,existingSessionId,existingSessionMode}`, `sessionMode` |
| API-017/065 | request `mode?` default STANDARD; response `sessionMode`, snapshot question `usageScope` |
| API-098/099 / worker | `usageScope`; DEMO_PRESET batch는 personal BASE 1개와 job+problem binding |

### Shared errors

- reuse: `INTERVIEW_NCS_WEIGHT_INVALID`, `INTERVIEW_NCS_BINDING_INVALID`, `INTERVIEW_NCS_QUESTION_COVERAGE_INVALID`
- new: `INTERVIEW_NCS_ACTIVE_PROFILE_INVALID`
- new: `INTERVIEW_CONFIGURATION_LOCKED`
- new: `INTERVIEW_DEMO_PRESET_NOT_READY`
- new: `INTERVIEW_DEMO_PRESET_QUESTION_POOL_INSUFFICIENT`
- new: `INTERVIEW_SESSION_MODE_CONFLICT`
- new: `INTERVIEW_NCS_FRAMEWORK_UNSUPPORTED`

## WT2 / C

- Branch: `feat/ncs-demo-preset-c-settings`
- Start: final Foundation commit
- Owns: criteria checkbox/weight UI, `weight=0`, sum 100, submitted-history lock, question impact confirmation, exclusive question inactive, multi-binding REVIEW_REQUIRED, ACTIVE set reconfirmation, V2 coverage and C tests.
- Must not edit: Foundation migration, Prisma enum/columns, `backend/common` enum/error/DTO/validator, V1 scoring/report formulas.
- Required review: A for shared migration boundary, D/E for projections consumed downstream, PM for warning/lock copy.

## WT3 / D

- Branch: `feat/ncs-demo-preset-d-session`
- Start: final Foundation commit
- Owns: application/guide readiness projection, demo button, `mode` lock, application advisory lock, eligible server selection, immutable snapshot, exact 1 common -> 1 personalized -> 1 follow-up order and candidate runtime/API/frontend tests.
- Same DEMO_PRESET mode resumes; different official mode returns `INTERVIEW_SESSION_MODE_CONFLICT`.
- Must not edit: Foundation migration/shared contracts, worker prompt/evaluator/report, C criteria mutation.
- Required review: C for eligible common pool, E for demo question/follow-up availability, A for transaction/index boundary, PM for user flow.

## WT4 / E

- Branch: `feat/ncs-demo-preset-e-pipeline`
- Start: final Foundation commit
- Owns: post-submit preset-only batch, factual anchor extraction, exact job+problem binding, max two generation attempts then safe anchored template, demo unavailable when no anchor, no common follow-up, exactly one personalized follow-up with inherited binding, active-only V2 evaluator/aggregation/report, V1 regression.
- STANDARD and DEMO_PRESET batch/stale/retry are isolated by `usageScope`.
- Must not edit: Foundation migration/shared contracts, C settings service/UI, D session selection.
- Required review: A for worker/migration consumption, C for binding contract, D for snapshot/follow-up handoff, PM for incomplete/report copy.

## WT5 Integration

- Branch: `feat/ncs-demo-preset-active-criteria`
- Contains WT1 Foundation.
- Merge order: C -> E -> D.
- Resolve contract conflicts in Foundation first; do not accept branch-local enum/error/schema variants.
- Run clean migration, V1 regression, V2 STANDARD and DEMO_PRESET E2E, A/C/D/E/PM harnesses and AWS `Run database migration` review.

## Test Matrix

| Scenario | WT1 | WT2 | WT3 | WT4 | WT5 |
| --- | --- | --- | --- | --- | --- |
| V1 exact 3 / profile coverage 2 | validator regression | C save regression | session regression | evaluator/report regression | E2E |
| V2 active 1/2/3, weight sum 100 | validator | save/UI | snapshot | active-only score | E2E |
| binding 0/1/2/3 and duplicate | validator | authoring | snapshot | worker input | E2E |
| submitted-history configuration lock | contract | repository/service/UI | read only | read only | E2E |
| demo readiness reasons | DTO | common pool | projection/UI | batch/anchor status | E2E |
| same-mode idempotency / cross-mode conflict | contract/schema | - | service tests | - | concurrency E2E |
| demo exact 3 questions | validator | common eligibility | order/snapshot | personal/follow-up | browser E2E |
| STANDARD/demo batch isolation | schema/unique key | policy projection | selection | worker repository | migration/E2E |

## Known Existing Implementation Delta

| Current implementation | Downstream action |
| --- | --- |
| `buildQuestionAllocations` cycles exactly three criteria only for V1 | WT2 adds active-profile V2 allocation without changing V1 branch |
| C/D session gates hard-code three profiles and minimum 2 | WT2/WT3 branch by framework; V1 stays 2, V2 active profiles use 1 |
| OpenAI question provider returns exactly one `criterionId` | WT4 creates/validates the DEMO_PRESET personal question with two bindings after generation; prompt/provider contract change requires E review |
| bindings already support 1~2 relational rows | reuse; do not add array/string profile storage |
| follow-up already copies source binding rows | WT4 additionally enforces demo source eligibility, exact once and usage-scope inheritance |
| `question_bank.is_active` exists | WT2 reuses it for exclusive questions; no new soft-delete field |
| `interview_sessions.deleted_at` exists | WT3 excludes deleted sessions when enforcing official mode lock |
| API request DTO runtime allow-list still accepts only LEGACY/V1 | WT2 adds V2 only when V2 validation/mutation is implemented; Foundation prevents V2 from falling through LEGACY logic |

## Review Checklist

- A: migration order, enum types, business unique key, `required_question_count >= 1`, AWS deploy
- C: all three canonical rows preserved while weight 0 derives inactive
- D: no DB-only uniqueness assumption; application lock/transaction protects official mode
- E: DEMO_PRESET does not mutate STANDARD batch state; V1 output unchanged
- PM: demo is official interview, readiness wording, no frontend random selection
