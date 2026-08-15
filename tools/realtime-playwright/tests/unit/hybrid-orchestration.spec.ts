import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  APPROVED_PLAYWRIGHT_FLEET,
  buildFleetStopPlan,
  buildHybridBrowserStagePlan,
} from "../../src/hybrid-allocation.mjs";

test.describe("hybrid orchestration contract", () => {
  test("browser plan schedules one VU on exactly five approved hosts", () => {
    const plan = buildHybridBrowserStagePlan({
      totalUsers: 100,
      attempt: 1,
      startAtEpoch: 1_786_651_200,
      runId: "run-20260814-hybrid",
      instances: allTwentyInstances(),
    });
    expect(plan).toHaveLength(5);
    expect(plan.map((host) => host.assignedUsers)).toEqual([1, 1, 1, 1, 1]);
    expect(plan.map((host) => host.instanceIndex)).toEqual([1, 3, 7, 9, 14]);
    expect(plan.map((host) => host.fixtureOrdinal)).toEqual([1, 21, 61, 81, 131]);
    expect(plan.every((host) => host.commandArgs.includes("--hold-seconds"))).toBe(true);
    expect(plan.every((host) => host.commandArgs.includes("150"))).toBe(true);
    expect(JSON.stringify(plan)).not.toMatch(/magicToken|applicationId|eyJ/i);
  });

  test("stop plan is the exact fifteen-host complement", () => {
    const plan = buildFleetStopPlan(allTwentyInstances());
    expect(plan.stop).toHaveLength(15);
    expect(plan.keep.map((host) => host.instanceIndex)).toEqual([1, 3, 7, 9, 14]);
    expect(new Set([...plan.keep, ...plan.stop].map((host) => host.instanceId)).size).toBe(20);
  });

  test("mismatched fleet or unapproved stage produces no browser plan", () => {
    const mismatched = allTwentyInstances();
    mismatched["14"].instance_id = "i-00000000000000000";
    expect(() => buildHybridBrowserStagePlan({
      totalUsers: 50,
      attempt: 1,
      startAtEpoch: 1_786_651_200,
      runId: "run-20260814-hybrid",
      instances: mismatched,
    })).toThrow("approved allowlist");
    expect(() => buildHybridBrowserStagePlan({
      totalUsers: 25,
      attempt: 1,
      startAtEpoch: 1_786_651_200,
      runId: "run-20260814-hybrid",
      instances: allTwentyInstances(),
    })).toThrow("hybrid stage");
  });

  test("PowerShell controller exposes only approved actions and strict stop gates", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    for (const action of ["Preflight", "FleetStopPreview", "FleetStop", "FixtureApply", "ApiCanary", "Run", "Collect"]) {
      expect(source).toContain(`'${action}'`);
    }
    expect(source).toContain("i-07aedd1f26e5be17d");
    expect(source).toContain("http://127.0.0.1:18080");
    expect(source).toContain("portNumber=8080,localPortNumber=18080");
    expect(source).toContain("GetNetworkCredential().Password");
    expect(source).toContain('Authorization = "Basic $encodedCredential"');
    expect(source).not.toContain("Credential = $NgrinderCredential");
    expect(source).toContain("HYBRID_PASSED");
    expect(source).toContain("Start-Sleep -Seconds 120");
    expect(source).toMatch(/Fleet\s*=\s*\$null/);
    expect(source).toMatch(/try\s*\{\s*Save-HybridWindow[\s\S]*?finally\s*\{[\s\S]*?Stop-NgrinderTunnel/);
    expect(source).not.toMatch(/terminate-instances|terraform\s+destroy|s3\s+rm|DeleteObject|Cleanup/i);
  });

  test("collects bottleneck evidence without changing the strict gate", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    for (const service of ["api", "frontend", "worker"]) {
      for (const resource of ["cpu", "memory"]) {
        for (const statistic of ["average", "maximum"]) {
          expect(source).toContain(`${service}_${resource}_${statistic}`);
        }
      }
    }
    expect(source).toContain("db_cpu_credit_balance");
    expect(source).toContain("alb_5xx");
    expect(source).toContain("HTTPCode_ELB_5XX_Count");
    for (const values of ["alb5xxValues", "target5xxValues", "connectionValues", "p95Values"]) {
      expect(source).toContain(`[double[]]$${values}`);
    }
    expect(source).toContain("Resolve-RdsInstanceIdentifier");
    expect(source).toContain("Get-EcsServiceSnapshot");
    expect(source).toContain("Get-EcsServicesTaskEvidence");
    expect(source).toContain("Invoke-BottleneckStageReport");
    expect(source).toContain("Invoke-BottleneckFinalReport");
    expect(source).toContain("--if-none-match");
    expect(source).toContain("D:\\jungleCamp\\loadtest-results");
    expect(source).toMatch(/try\s*\{\s*Invoke-BottleneckStageReport[\s\S]*?catch\s*\{\s*Write-Warning 'BOTTLENECK_SUMMARY_FAILED'/);
    expect(source).toMatch(/\[string\]\$current\[0\]\.verdict/);
    expect(source).toMatch(/runs\/\$RunId\/stages\/\$StageUsers\/attempt-\$Attempt\//);
    expect(source).not.toMatch(/terraform\s+apply|delete-object|s3\s+rm/i);
  });

  test("isolates local raw evidence by attempt before stage collection", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain('$attemptRawDirectory = Join-Path $rawDirectory "attempt-$Attempt"');
    expect(source).toContain('$stageDirectory = Join-Path $attemptRawDirectory "stage-$StageUsers"');
    expect(source).toContain('"--input=$attemptRawDirectory"');
    expect(source).not.toContain('$stageDirectory = Join-Path $rawDirectory "stage-$StageUsers"');
  });

  test("retrieves conditional AWS PNG evidence with binary-safe fixed metadata", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain("plan-cloudwatch-evidence-images.mjs");
    expect(source).toContain("'cloudwatch', 'get-metric-widget-image'");
    expect(source).toContain("[Convert]::FromBase64String");
    expect(source).toContain("Get-FileHash -LiteralPath $imagePath -Algorithm SHA256");
    expect(source).toContain("CLOUDWATCH_IMAGE_GENERATION_FAILED");
    expect(source).toContain("cloudwatch-images.json");
    expect(source).toContain("ecs-resource-utilization.png");
    expect(source).toContain("server-failure-signals.png");
    expect(source).toContain("--cloudwatch-images=$imageMetadataPath");
    expect(source).not.toMatch(/get-metric-widget-image[^\r\n]+>/);
  });

  test("nGrinder attempt root is writable by the nGrinder service account", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain(
      'install -d -m 0700 -o ngrinder -g ngrinder "`$attempt_dir" "`$attempt_dir/vu-results"',
    );
  });

  test("nGrinder and browser workloads share an explicit UTC start barrier", () => {
    const controller = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    const barrierAssignment = controller.indexOf(
      "$barrierEpoch = Get-AlignedBarrierEpoch",
    );
    const attemptInitialization = controller.indexOf(
      "Initialize-NgrinderAttempt -StageUsers $StageUsers -BarrierEpoch $barrierEpoch",
    );

    expect(barrierAssignment).toBeGreaterThan(-1);
    expect(attemptInitialization).toBeGreaterThan(barrierAssignment);
    expect(controller).toContain('"`$attempt_dir/start-at-epoch"');
    expect(controller).toContain('"--barrier-epoch-ms=$($StartEpoch * 1000)"');
    expect(groovy).toContain("/var/lib/ngrinder/hybrid-results/current/start-at-epoch");
    expect(groovy).toContain("waitForStartBarrier()");
    expect(groovy).toContain("grinder.sleep(Math.min(delayMs, 1_000L))");
    expect(groovy).toContain("startedAtEpochMs: startedAtEpochMs");
  });

  test("aligns the barrier to second ten so nGrinder starts just before instrumentation", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain("function Get-AlignedBarrierEpoch");
    expect(source).toContain("$minimumBarrierEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 120");
    expect(source).toContain("[Math]::Floor($minimumBarrierEpoch / 60) * 60 + 10");
    expect(source).toContain("if ($barrierEpoch -lt $minimumBarrierEpoch) { $barrierEpoch += 60 }");
  });

  test("Run prewarms exactly three API tasks and always restores autoscaling", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");

    expect(source).toContain("function Set-ApiLoadtestCapacity");
    expect(source).toContain("function Wait-ApiLoadtestCapacity");
    expect(source).toContain("'application-autoscaling', 'register-scalable-target'");
    expect(source).toContain("'--min-capacity', $Minimum.ToString()");
    expect(source).toContain("'--max-capacity', $Maximum.ToString()");
    expect(source).toContain("'ecs', 'wait', 'services-stable'");
    expect(source).toContain("desiredCount -ne 3");
    expect(source).toContain("runningCount -ne 3");
    expect(source).toContain("pendingCount -ne 0");
    expect(source).toContain("$targetStates.Count -ne 3");
    expect(source).toContain("if ($Action -eq 'Run')");
    expect(source).toContain("API_ALB_TRANSITION_NO_HEALTHY_TARGET");

    const runAction = source.match(/'Run'\s*\{[\s\S]*?\n    \}\n    'Collect'/)?.[0] ?? "";
    expect(runAction).toContain("Set-ApiLoadtestCapacity -Context $context -Minimum 3 -Maximum 3");
    expect(runAction).toContain("Wait-ApiLoadtestCapacity -Context $context");
    expect(runAction).toMatch(/try\s*\{[\s\S]*?finally\s*\{[\s\S]*?Set-ApiLoadtestCapacity -Context \$context -Minimum 1 -Maximum 3/);
    expect(runAction).toContain("API_AUTOSCALING_RESTORE_FAILED");
  });

  test("can reuse an earlier passed canary while reserving a fresh stage attempt", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain("[int]$ValidatedCanaryAttempt = $Attempt");
    expect(source).toContain("$ValidatedCanaryAttempt -gt $Attempt");
    expect(source).toContain("canary/attempt-$ValidatedCanaryAttempt/summary/api-summary.json");
    expect(source).toContain("[int]$_.attempt -eq $ValidatedCanaryAttempt");
  });

  test("nGrinder watchdog leaves enough room beyond the 240-second performance window", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain("$BarrierEpoch + 360");
    expect(source).not.toContain("$BarrierEpoch + 250");
    expect(source).toContain("watchdog=360s");
  });

  test("nGrinder failures retain safe status diagnostics and clean up the tunnel child", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain('NGRINDER_REST_REQUEST_FAILED:$statusCode');
    expect(source).toContain("PluginProcessIds");
    expect(source).toContain("Stop-NgrinderTunnel");
  });

  test("nGrinder tunnel resolves the installed Session Manager Plugin without caller PATH setup", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(source).toContain("Resolve-SessionManagerPluginDirectory");
    expect(source).toContain("Amazon\\SessionManagerPlugin\\bin");
    expect(source).toContain("session-manager-plugin-*");
  });

  test("nGrinder JSON serialization stays shallow for the Groovy source payload", () => {
    const source = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    const requestFunction = source.match(/function Invoke-NgrinderRequest[\s\S]*?function Publish-NgrinderScript/)?.[0];
    expect(requestFunction).toBeTruthy();
    expect(requestFunction).toContain("ConvertTo-Json -Depth 4 -Compress");
    expect(requestFunction).not.toContain("ConvertTo-Json -Depth 30");
    expect(source).toContain("[System.IO.File]::ReadAllText");
  });

  test("nGrinder HTTP plugin is initialized in the process lifecycle", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    expect(groovy).toContain("private static HTTPRequest request");
    expect(groovy).toMatch(/@BeforeProcess[\s\S]*?static void beforeProcess\(\) \{[\s\S]*?request = new HTTPRequest\(\)/);
    expect(groovy).not.toMatch(/@BeforeThread[\s\S]*?void beforeThread\(\) \{\s*request = new HTTPRequest\(\)/);
  });

  test("nGrinder restores SNI before initializing the classic HTTP plugin", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    const beforeProcess = groovy.match(/@BeforeProcess[\s\S]*?static void beforeProcess\(\) \{[\s\S]*?\n  \}/)?.[0];
    expect(beforeProcess).toBeTruthy();
    expect(beforeProcess).toContain('System.setProperty("jsse.enableSNIExtension", "true")');
    expect(beforeProcess!.indexOf('System.setProperty("jsse.enableSNIExtension", "true")'))
      .toBeLessThan(beforeProcess!.indexOf("HTTPPluginControl.getConnectionDefaults()"));
  });

  test("nGrinder records hold duration without using it as a failure gate", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    expect(groovy).toContain("grinder.sleep(32_000L)");
    expect(groovy).not.toContain("grinder.sleep(30_000L)");
    expect(groovy).toContain("runtimeSamples != 5");
    expect(groovy).not.toContain("heldMs < 150_000L");
    expect(groovy).toContain("heldMs: elapsedHoldMilliseconds()");
  });

  test("nGrinder REST validation uses a no-load source variant", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    const controller = readFileSync(resolve("../../scripts/hybrid-loadtest.ps1"), "utf8");
    expect(groovy).toContain("private static final boolean VALIDATION_ONLY = false");
    expect(groovy).toMatch(/void beforeThread\(\) \{\s*if \(VALIDATION_ONLY\) \{\s*return/);
    expect(groovy).toMatch(/void holdSample\(\) \{\s*if \(VALIDATION_ONLY\) \{\s*return/);
    expect(groovy).toMatch(/void afterThread\(\) \{\s*if \(VALIDATION_ONLY\) \{\s*return/);
    expect(controller).toContain('$validationSource = $source.Replace(');
    expect(controller).toContain("private static final boolean VALIDATION_ONLY = true");
    expect(controller).toMatch(/\$validationFileEntry\s*=\s*\[ordered\]@\{[\s\S]*?content\s*=\s*\$validationSource/);
    expect(controller).toMatch(/\/script\/api\/validate[\s\S]*?fileEntry\s*=\s*\$validationFileEntry/);
    expect(controller).toContain("NGRINDER_SCRIPT_VALIDATION_INCOMPLETE");
    expect(controller).toContain("NGRINDER_SCRIPT_VALIDATION_ERROR");
    expect(controller).not.toContain("if (-not [string]::IsNullOrWhiteSpace($validation.Content)) { throw 'NGRINDER_SCRIPT_VALIDATION_FAILED' }");
  });

  test("nGrinder requests use the stable classic HTTP plugin types", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    expect(groovy).toContain("net.grinder.plugin.http.HTTPPluginControl");
    expect(groovy).toContain("net.grinder.plugin.http.HTTPRequest");
    expect(groovy).toContain("HTTPClient.NVPair");
    expect(groovy).toContain("NVPair[] query");
    expect(groovy).toContain("NVPair[] requestHeaders");
    expect(groovy).not.toContain("request.GET(BASE_URL + path, params, headers)");
    expect(groovy).not.toContain("org.ngrinder.http.HTTPRequest");
  });

  test("nGrinder connection failures persist only a fixed safe failure code", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    expect(groovy).toContain('new SafeFailure("HTTP_CONNECTION_ERROR")');
    expect(groovy).not.toContain("grinder.logger");
    expect(groovy).not.toContain("error.message");
  });

  test("nGrinder persists fixed route metrics without URL or identity fields", () => {
    const groovy = readFileSync(resolve("ngrinder/hybrid-interview.groovy"), "utf8");
    expect(groovy).toContain('"APPLICATION_STATUS"');
    expect(groovy).toContain('"INTERVIEW_RUNTIME"');
    expect(groovy).toMatch(/classifyRequest\(String routeKey, Closure<HTTPResponse> action\)/);
    const safeResult = groovy.match(/Map<String, Object> safeResult = \[[\s\S]*?\n    \]/)?.[0] ?? "";
    expect(safeResult).toContain("routeLatencyMs: routeLatencyMs");
    expect(safeResult).toContain("routeFailures: routeFailures");
    expect(safeResult).not.toMatch(/applicationId|sessionId|magicToken|publicAccessToken|BASE_URL/);
  });
});

function allTwentyInstances() {
  return Object.fromEntries(APPROVED_PLAYWRIGHT_FLEET.map((host) => [
    String(host.instanceIndex).padStart(2, "0"),
    {
      instance_id: host.instanceId,
      instance_index: host.instanceIndex,
      row_start: (host.instanceIndex - 1) * 10 + 1,
      row_end: host.instanceIndex * 10,
    },
  ]));
}
