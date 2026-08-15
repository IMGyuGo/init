# API ECS 오토스케일링 및 200명 부하 테스트 설계

## 배경

현재 `api` ECS 서비스는 Fargate 태스크 1개로 실행되며 Service Auto Scaling이 없다. 50명 재시험에서는 API 45명이 150초를 완료했고 API CPU 최대값은 46.187%였다. 이후 API 95명 실행에서는 API CPU가 99.67%까지 올라가고 ALB 생성 502가 1건 발생해 nGrinder가 중단됐다. API 메모리 최대값은 20.264%였고 ECS 태스크 중단이나 교체는 없었다.

해결 목표는 API 서비스에만 CPU 기반 오토스케일링을 적용해 정상 운영 시 1개까지 축소하고, 부하 시 최대 3개까지 확장하는 것이다. 확장 적용과 안정화를 확인한 뒤 안전한 단계 상승을 거쳐 200명 부하 테스트까지 수행한다.

## 검토한 접근법

### 1. CPU 목표 추적 + 테스트 직전 사전 기동 3개

API에 `ECSServiceAverageCPUUtilization` 목표 추적 정책을 적용한다. 최소 1개, 최대 3개, 목표 CPU 60%, scale-out cooldown 60초, scale-in cooldown 300초로 설정한다. 짧고 급격한 부하 테스트에서는 CloudWatch 평가와 Fargate 기동 시간이 필요하므로 테스트 직전에 API desired count를 3개로 올리고 3개가 모두 healthy가 된 뒤 시작한다.

장점은 정상 운영 비용을 1개 수준으로 유지하면서 장기 부하에는 자동 대응하고, 짧은 시험의 최초 스파이크도 사전 기동으로 보호한다는 점이다. 이 접근법을 채택한다.

### 2. API 태스크 3개 고정

구성이 단순하고 최초 스파이크에 즉시 대응하지만, 낮은 트래픽에서도 세 태스크 비용이 계속 발생한다. 오토스케일링 동작을 검증할 수 없으므로 채택하지 않는다.

### 3. CloudWatch 알람 + 단계 조정 정책

CPU 구간별로 `+1`, `+2` 태스크를 지정하면 확장 속도를 세밀하게 제어할 수 있다. 다만 알람과 단계 경계가 늘어나며 현재 요구에는 목표 추적 정책보다 복잡하다. 후속 튜닝이 필요할 때만 검토한다.

## Terraform 설계

API 서비스에 다음 리소스를 추가한다.

- `aws_appautoscaling_target`: `ecs:service:DesiredCount`, 최소 1, 최대 3
- `aws_appautoscaling_policy`: `TargetTrackingScaling`
- 사전 정의 지표: `ECSServiceAverageCPUUtilization`
- 목표값: 60%
- scale-out cooldown: 60초
- scale-in cooldown: 300초

오토스케일러가 변경한 API desired count를 다음 Terraform apply가 1로 되돌리지 않도록 API 서비스의 `desired_count`만 lifecycle drift 대상에서 제외한다. `frontend`와 `worker`의 desired count는 기존처럼 Terraform이 계속 관리한다. 기존 `aws_ecs_service.service["api"]` 상태를 API 전용 리소스 주소로 이동하는 `moved` 선언을 사용하고, plan에서 서비스 교체나 삭제가 없음을 필수 조건으로 확인한다.

오토스케일링 값은 하나의 `api_autoscaling` 객체 변수로 노출하고 `env/main.tfvars`에 운영값을 명시한다. 변수 검증은 최소값이 1 이상, 최대값이 최소값 이상이면서 3 이하, CPU 목표값이 1~100 사이, cooldown이 음수가 아닌 정수인지를 검사한다.

## Apply 안전 절차

1. 이동식 Terraform과 기존 S3 backend 설정을 사용해 `terraform init -reconfigure` 상태를 확인한다.
2. `terraform fmt -check`, `terraform validate`와 Terraform 계약 테스트를 통과시킨다.
3. 저장된 plan 파일을 만들고 변경 대상을 검토한다.
4. 허용되는 변경은 기존 API ECS 서비스의 상태 주소 이동, Application Auto Scaling target/policy 생성, 관련 출력 추가뿐이다.
5. ECS 서비스·태스크 정의·ALB·RDS·Redis·네트워크의 삭제, 교체 또는 변경이 있으면 apply하지 않는다.
6. 승인된 plan 파일만 apply한다.
7. AWS에서 scalable target과 정책을 조회하고 API desired/running count 및 ALB target health를 확인한다.

## 사전 기동과 오토스케일링 검증

단계별 시험 직전 Application Auto Scaling scalable target의 최소·최대 용량을 임시로 3/3으로 설정해 API를 사전 기동한다. API running count가 3이고 세 ALB target이 모두 healthy가 될 때까지 기다린다. 이렇게 하면 120초 barrier 대기 중 target tracking scale-in이 태스크를 다시 줄이지 않는다. 모든 시험의 성공·실패와 관계없이 `finally` 정리 절차에서 최소·최대 용량을 Terraform 운영값인 1/3으로 복원하고, 정책이 다시 활성 상태인지 확인한다.

오토스케일링 검증 증거에는 scalable target의 min/max, 정책의 목표 CPU와 cooldown, scaling activity, API desired/running/pending count 변화, ALB target health를 저장한다. 태스크 ARN이나 자격증명은 보고서에 남기지 않는다.

## 부하 테스트 절차

기존 실행 데이터는 덮어쓰지 않고 새 Run ID와 새 fixture dataset을 사용한다. 이전 실행에서 nGrinder가 예정 barrier보다 먼저 시작한 문제가 확인됐으므로, API와 브라우저가 같은 UTC barrier를 실제로 기다리도록 동기화 계약을 먼저 수정하고 검증한다.

시험 순서는 다음과 같다.

1. 새 fixture 생성 및 1명 API canary
2. API 태스크 3개 사전 기동 및 세 target healthy 확인
3. 50명 단계
4. 100명 단계
5. 200명 단계

각 단계 사이에 ECS와 ALB 상태를 확인한다. 다음 조건 중 하나라도 발생하면 다음 단계로 진행하지 않는다.

- ALB 생성 5xx 또는 target 5xx
- ALB target 연결 오류
- ECS 태스크 중단, 교체, desired/running 불일치
- API CPU 99% 이상 포화
- 필수 CloudWatch 증거 누락

브라우저 console error와 비서버 request failure는 결과에 기록하지만 서버 부하 실패로 자동 분류하지 않는다. 각 단계에서 API CPU·메모리, frontend/worker CPU·메모리, API p95, ALB 오류, ECS 태스크 상태를 수집한다. CPU 또는 메모리 경고나 서버 실패가 있으면 AWS `GetMetricWidgetImage`로 전후 그래프를 생성한다.

## 성공 기준

- Terraform apply가 삭제나 교체 없이 API 오토스케일링 target과 정책을 생성한다.
- API scalable target이 최소 1, 최대 3으로 조회된다.
- API 태스크 3개 사전 기동 후 desired/running이 3/3이고 ALB target이 모두 healthy다.
- API와 브라우저의 첫 실제 요청 시각이 동일 UTC barrier 이후이며 서로 5초 이내다.
- 200명 단계에서 ALB/target 5xx와 연결 오류가 0이다.
- ECS 태스크 중단이나 교체가 없다.
- API CPU·메모리와 응답 지연, 태스크 수 변화가 결과와 AWS 그래프로 보존된다.

200명 단계가 실패하더라도 증거가 완전하게 수집되면 시험 절차는 완료로 간주하되, 시스템 용량 성공으로 판정하지 않는다.
