# AI Golden Cases

AI report/pipeline 회귀 검증용 golden case를 둔다.

각 JSON 파일은 최소한 아래 shape을 가진다.

```json
{
  "name": "case name",
  "input": {},
  "expected": {
    "outputShape": {}
  }
}
```

`scripts/verify-ai-golden.ps1`은 JSON parse 가능 여부와 `input`, `expected`, `expected.outputShape` 존재 여부를 확인한 뒤 worker 테스트를 실행한다. Worker 테스트는 golden case를 mock handler에 연결해 output shape와 guardrail 결과를 검증한다.
