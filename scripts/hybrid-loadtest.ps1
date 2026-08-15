[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Preflight', 'FleetStopPreview', 'FleetStop', 'FixtureApply', 'ApiCanary', 'Run', 'Collect')]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^run-[a-z0-9][a-z0-9_-]{0,59}$')]
    [string]$RunId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^pwload-[a-z0-9][a-z0-9_-]{0,57}$')]
    [string]$DatasetId,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, [long]::MaxValue)]
    [long]$CompanyId,

    [ValidateRange(1, [long]::MaxValue)]
    [long]$PostingId = 36,

    [ValidateSet(50, 100, 200)]
    [int[]]$Stages = @(50, 100, 200),

    [ValidateRange(1, 1000)]
    [int]$Attempt = 1,

    [PSCredential]$NgrinderCredential,
    [switch]$ConfirmProductionWrite,
    [switch]$ConfirmFleetStop,
    [switch]$ConfirmProductionLoad,
    [switch]$DryRun,
    [string]$ExpectedAwsAccountId = $env:PLAYWRIGHT_LOADTEST_AWS_ACCOUNT_ID,
    [string]$ResultsDirectory = 'D:\jungleCamp\loadtest-results',
    [string]$BaselineSummaryPath = 'D:\jungleCamp\loadtest-results\run-20260802-231235\summary\summary.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$script:RepositoryRoot = Split-Path -Parent $PSScriptRoot
$script:TerraformDirectory = Join-Path $script:RepositoryRoot 'infra\aws'
$script:PlaywrightToolDirectory = Join-Path $script:RepositoryRoot 'tools\realtime-playwright'
$script:AwsRegion = 'ap-northeast-2'
$script:TargetOrigin = 'https://init-jungle.cloud'
$script:NgrinderInstanceId = 'i-07aedd1f26e5be17d'
$script:NgrinderLocalOrigin = 'http://127.0.0.1:18080'
$script:BaselineRunId = 'run-20260802-231235'
$script:ApprovedStages = @(50, 100, 200)
$script:ApiUsers = @{ 1 = 1; 50 = 45; 100 = 95; 200 = 195 }

function Assert-InputContract {
    if ($PostingId -ne 36) { throw 'PostingId는 36만 허용합니다.' }
    if (@($Stages | Select-Object -Unique).Count -ne $Stages.Count) { throw 'Stages에 중복 값이 있습니다.' }
    $sortedStages = @($Stages | Sort-Object)
    if (($sortedStages -join ',') -cne ($Stages -join ',')) { throw 'Stages는 오름차순이어야 합니다.' }
    if (-not $DryRun -and $ExpectedAwsAccountId -notmatch '^\d{12}$') {
        throw '실제 실행에는 12자리 ExpectedAwsAccountId가 필요합니다.'
    }
    if ($Action -in @('ApiCanary', 'Run') -and -not $DryRun -and $null -eq $NgrinderCredential) {
        throw 'nGrinder 실행에는 메모리 내 PSCredential이 필요합니다.'
    }
    if ($Action -eq 'FixtureApply' -and -not $ConfirmProductionWrite) {
        throw 'FixtureApply에는 -ConfirmProductionWrite가 필요합니다.'
    }
    if ($Action -eq 'FleetStop' -and -not $ConfirmFleetStop) {
        throw 'FleetStop에는 -ConfirmFleetStop이 필요합니다.'
    }
    if ($Action -in @('ApiCanary', 'Run') -and -not $ConfirmProductionLoad) {
        throw 'ApiCanary/Run에는 -ConfirmProductionLoad가 필요합니다.'
    }
}

function Write-DryRun([string]$Message) {
    Write-Host "[DRY-RUN] $Message"
}

function Get-AlignedBarrierEpoch {
    # nGrinder scheduler는 분 단위로 worker를 시작한다. :10 장벽이면 worker 초기화
    # (약 7초)가 먼저 끝나면서도 API와 browser가 같은 UTC 초에 진입할 수 있다.
    [long]$minimumBarrierEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 120
    [long]$barrierEpoch = [long]([Math]::Floor($minimumBarrierEpoch / 60) * 60 + 10)
    if ($barrierEpoch -lt $minimumBarrierEpoch) { $barrierEpoch += 60 }
    $barrierEpoch
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [switch]$AllowFailure
    )
    $output = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "외부 명령 실패: $FilePath ($exitCode)"
    }
    [pscustomobject]@{ ExitCode = $exitCode; Output = ($output -join "`n") }
}

function New-JsonTempFile([object]$Value) {
    $path = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText(
        $path,
        ($Value | ConvertTo-Json -Depth 30 -Compress),
        [System.Text.UTF8Encoding]::new($false)
    )
    $path
}

function Get-TerraformOutputs {
    $result = Invoke-External -FilePath 'terraform' -Arguments @("-chdir=$script:TerraformDirectory", 'output', '-json')
    $result.Output | ConvertFrom-Json
}

function Get-OutputValue([object]$Outputs, [string]$Name) {
    $property = $Outputs.PSObject.Properties[$Name]
    if ($null -eq $property) { throw "Terraform output 누락: $Name" }
    $property.Value.value
}

function New-DryRunInstances {
    $ids = @(
        'i-06ef096254e2b3ceb', 'i-066d993439af7f872', 'i-0716d9a9a1dd64309', 'i-011398f7e9ed2d754',
        'i-0515173f2321ec57f', 'i-07fe10471690d82df', 'i-017824d0c9e1afc7e', 'i-0bfc6b869229525df',
        'i-0470c9029c3d0ea19', 'i-00598fcd7c9786fba', 'i-0a3934d127e8440a8', 'i-000bbffb7403ef3d6',
        'i-073a6fa00e9a8c4e4', 'i-00c76154c6f51c24e', 'i-02165f4b42a9f8e4b', 'i-08c2861fb3146e633',
        'i-008d75710f83c7264', 'i-01b8860a0dd325406', 'i-0f7484963c0853462', 'i-0f7923d241c6caf1e'
    )
    $map = [ordered]@{}
    foreach ($index in 1..20) {
        $map[$index.ToString('00')] = [ordered]@{
            instance_id = $ids[$index - 1]
            instance_index = $index
            row_start = (($index - 1) * 10 + 1)
            row_end = ($index * 10)
        }
    }
    [pscustomobject]$map
}

function Get-HybridPlan {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('fleet', 'stage')][string]$Mode,
        [Parameter(Mandatory = $true)][object]$Instances,
        [int]$StageUsers = 0,
        [long]$StartAtEpoch = 0
    )
    $instancesPath = New-JsonTempFile $Instances
    try {
        $arguments = @(
            (Join-Path $script:PlaywrightToolDirectory 'scripts\build-hybrid-stage-plan.mjs'),
            "--mode=$Mode", "--instances-json=$instancesPath"
        )
        if ($Mode -eq 'stage') {
            $arguments += @(
                "--stage-users=$StageUsers", "--run-id=$RunId", "--attempt=$Attempt",
                "--start-at-epoch=$StartAtEpoch"
            )
        }
        ((Invoke-External -FilePath 'node' -Arguments $arguments).Output | ConvertFrom-Json)
    }
    finally {
        Remove-Item -LiteralPath $instancesPath -Force -ErrorAction SilentlyContinue
    }
}

function Get-InstanceStateMap([string[]]$InstanceIds) {
    $arguments = @('ec2', 'describe-instances', '--instance-ids') + $InstanceIds + @(
        '--query', 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType}',
        '--output', 'json', '--region', $script:AwsRegion
    )
    $rows = @(((Invoke-External -FilePath 'aws' -Arguments $arguments).Output | ConvertFrom-Json))
    if ($rows.Count -ne $InstanceIds.Count) { throw 'EC2 조회 개수가 승인 목록과 다릅니다.' }
    $map = @{}
    foreach ($row in $rows) { $map[[string]$row.Id] = $row }
    $map
}

function Wait-SsmCommand {
    param(
        [Parameter(Mandatory = $true)][string]$CommandId,
        [Parameter(Mandatory = $true)][string]$InstanceId,
        [int]$TimeoutSeconds = 600
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $result = Invoke-External -FilePath 'aws' -Arguments @(
            'ssm', 'get-command-invocation', '--command-id', $CommandId, '--instance-id', $InstanceId,
            '--output', 'json', '--region', $script:AwsRegion
        ) -AllowFailure
        if ($result.ExitCode -ne 0) { Start-Sleep -Seconds 3; continue }
        $invocation = $result.Output | ConvertFrom-Json
        if ($invocation.Status -eq 'Success') { return $invocation }
        if ($invocation.Status -notin @('Pending', 'InProgress', 'Delayed')) {
            throw "SSM command 실패: $($invocation.Status)"
        }
        Start-Sleep -Seconds 5
    }
    throw 'SSM command timeout'
}

function Invoke-SsmShell {
    param(
        [Parameter(Mandatory = $true)][string]$InstanceId,
        [Parameter(Mandatory = $true)][string]$Command,
        [int]$TimeoutSeconds = 600,
        [switch]$ReturnImmediately
    )
    $parametersPath = New-JsonTempFile @{ commands = @($Command) }
    try {
        $commandId = (Invoke-External -FilePath 'aws' -Arguments @(
            'ssm', 'send-command', '--instance-ids', $InstanceId,
            '--document-name', 'AWS-RunShellScript', '--parameters', "file://$parametersPath",
            '--timeout-seconds', $TimeoutSeconds.ToString(), '--query', 'Command.CommandId',
            '--output', 'text', '--region', $script:AwsRegion
        )).Output.Trim()
        if ($commandId -notmatch '^[0-9a-f-]{36}$') { throw 'SSM command ID 형식이 올바르지 않습니다.' }
        if ($ReturnImmediately) {
            return [pscustomobject]@{ CommandId = $commandId; InstanceId = $InstanceId }
        }
        Wait-SsmCommand -CommandId $commandId -InstanceId $InstanceId -TimeoutSeconds $TimeoutSeconds
    }
    finally {
        Remove-Item -LiteralPath $parametersPath -Force -ErrorAction SilentlyContinue
    }
}

function Assert-SsmOnline([string[]]$InstanceIds) {
    $filter = 'Key=InstanceIds,Values=' + ($InstanceIds -join ',')
    $rows = @(((Invoke-External -FilePath 'aws' -Arguments @(
        'ssm', 'describe-instance-information', '--filters', $filter,
        '--query', 'InstanceInformationList[].{Id:InstanceId,Status:PingStatus}',
        '--output', 'json', '--region', $script:AwsRegion
    )).Output | ConvertFrom-Json))
    $online = @($rows | Where-Object { $_.Status -eq 'Online' } | ForEach-Object { [string]$_.Id })
    foreach ($instanceId in $InstanceIds) {
        if ($online -notcontains $instanceId) { throw "SSM Offline: $instanceId" }
    }
}

function Assert-Baseline25([object]$Outputs) {
    if (-not (Test-Path -LiteralPath $BaselineSummaryPath)) { throw '25명 baseline summary가 없습니다.' }
    $baseline = Get-Content -LiteralPath $BaselineSummaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $stage = @($baseline.stages | Where-Object { [int]$_.users -eq 25 })
    if ($stage.Count -ne 1 -or [int]$stage[0].total -ne 25 -or [int]$stage[0].passed -ne 25 `
        -or [int]$stage[0].failed -ne 0 -or $stage[0].verdict -cne 'GENERATOR_CONSTRAINED') {
        throw '25명 baseline 판정이 보존 계약과 다릅니다.'
    }
    $bucket = Get-OutputValue $Outputs 'playwright_loadtest_bucket_name'
    $objects = ((Invoke-External -FilePath 'aws' -Arguments @(
        's3api', 'list-objects-v2', '--bucket', $bucket,
        '--prefix', "runs/$script:BaselineRunId/stages/25/", '--output', 'json', '--region', $script:AwsRegion
    )).Output | ConvertFrom-Json)
    $keys = @($objects.Contents | ForEach-Object { [string]$_.Key })
    if (@($keys | Where-Object { $_ -match '/ready\.png$' }).Count -lt 25 `
        -or @($keys | Where-Object { $_ -match '/completed\.png$' }).Count -lt 25) {
        throw '25명 baseline S3 screenshot 증거가 부족합니다.'
    }
}

function Resolve-MetricDimensions([object]$Outputs) {
    $albDnsName = Get-OutputValue $Outputs 'alb_dns_name'
    $loadBalancerArn = (Invoke-External -FilePath 'aws' -Arguments @(
        'elbv2', 'describe-load-balancers', '--query',
        "LoadBalancers[?DNSName=='$albDnsName']|[0].LoadBalancerArn", '--output', 'text', '--region', $script:AwsRegion
    )).Output.Trim()
    if ($loadBalancerArn -notmatch ':loadbalancer/(.+)$') { throw 'ALB dimension을 확인할 수 없습니다.' }
    $albSuffix = $Matches[1]
    $targetGroupArn = (Invoke-External -FilePath 'aws' -Arguments @(
        'elbv2', 'describe-target-groups', '--load-balancer-arn', $loadBalancerArn,
        '--query', "TargetGroups[?contains(TargetGroupName,'api')]|[0].TargetGroupArn",
        '--output', 'text', '--region', $script:AwsRegion
    )).Output.Trim()
    if ($targetGroupArn -notmatch ':(targetgroup/.+)$') { throw 'API target group dimension을 확인할 수 없습니다.' }
    [pscustomobject]@{
        LoadBalancerArn = $loadBalancerArn
        AlbSuffix = $albSuffix
        TargetGroupArn = $targetGroupArn
        TargetGroupSuffix = $Matches[1]
    }
}

function Resolve-RdsInstanceIdentifier([object]$Outputs) {
    $terraformEndpoint = [string](Get-OutputValue $Outputs 'rds_endpoint')
    $result = Invoke-External -FilePath 'aws' -Arguments @(
        'rds', 'describe-db-instances', '--output', 'json', '--region', $script:AwsRegion
    )
    $databases = @((ConvertFrom-Json $result.Output).DBInstances | Where-Object {
        $candidateEndpoint = "{0}:{1}" -f $_.Endpoint.Address, $_.Endpoint.Port
        $candidateEndpoint -ceq $terraformEndpoint
    })
    if ($databases.Count -ne 1 -or [string]::IsNullOrWhiteSpace($databases[0].DBInstanceIdentifier)) {
        throw 'RDS_ENDPOINT_EVIDENCE_INCOMPLETE'
    }
    [string]$databases[0].DBInstanceIdentifier
}

function Assert-Preflight {
    if ($DryRun) {
        Write-DryRun "account/region/target exact 확인: $ExpectedAwsAccountId / $script:AwsRegion / $script:TargetOrigin"
        Write-DryRun 'Playwright keep 5, stop candidate 15, nGrinder 1, SSM, ECS, ALB, baseline 25 확인'
        return [pscustomobject]@{
            Instances = (New-DryRunInstances)
            Outputs   = $null
            Fleet     = $null
            Dimensions = $null
            RdsIdentifier = 'init-main-db'
        }
    }

    # 실제 변경 전에 account, exact fleet, nGrinder, ECS/ALB와 기존 25명 증거를 함께 고정한다.
    $account = (Invoke-External -FilePath 'aws' -Arguments @(
        'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text', '--region', $script:AwsRegion
    )).Output.Trim()
    if ($account -cne $ExpectedAwsAccountId) { throw 'AWS account가 승인값과 다릅니다.' }
    $health = Invoke-WebRequest -UseBasicParsing -Uri "$script:TargetOrigin/api/v1/health" -TimeoutSec 30
    if ($health.StatusCode -ne 200) { throw '운영 health check가 실패했습니다.' }

    $outputs = Get-TerraformOutputs
    if ((Get-OutputValue $outputs 'ngrinder_instance_id') -cne $script:NgrinderInstanceId) {
        throw 'nGrinder instance ID가 승인값과 다릅니다.'
    }
    $instances = Get-OutputValue $outputs 'playwright_loadtest_instances'
    $fleet = Get-HybridPlan -Mode fleet -Instances $instances
    $allIds = @($fleet.keep + $fleet.stop | ForEach-Object { [string]$_.instanceId })
    $states = Get-InstanceStateMap -InstanceIds ($allIds + @($script:NgrinderInstanceId))
    foreach ($fleetHost in $fleet.keep) {
        if ($states[$fleetHost.instanceId].State -cne 'running' -or $states[$fleetHost.instanceId].Type -cne 't3.large') {
            throw "선택 Playwright host 상태가 올바르지 않습니다: $($fleetHost.instanceId)"
        }
    }
    foreach ($fleetHost in $fleet.stop) {
        if ($states[$fleetHost.instanceId].State -notin @('running', 'stopped') -or $states[$fleetHost.instanceId].Type -cne 't3.large') {
            throw "비선택 Playwright host 상태가 올바르지 않습니다: $($fleetHost.instanceId)"
        }
    }
    if ($states[$script:NgrinderInstanceId].State -cne 'running') { throw 'nGrinder instance가 running이 아닙니다.' }
    Assert-SsmOnline -InstanceIds (@($fleet.keep | ForEach-Object { $_.instanceId }) + @($script:NgrinderInstanceId))
    $serviceCheck = Invoke-SsmShell -InstanceId $script:NgrinderInstanceId -Command (
        'systemctl is-active --quiet ngrinder-controller && systemctl is-active --quiet ngrinder-agent'
    )
    if ($serviceCheck.Status -ne 'Success') { throw 'nGrinder controller/agent가 active가 아닙니다.' }

    $cluster = Get-OutputValue $outputs 'ecs_cluster_name'
    $serviceNames = Get-OutputValue $outputs 'ecs_service_names'
    $names = @($serviceNames.PSObject.Properties | ForEach-Object { [string]$_.Value })
    $describeServiceArguments = @('ecs', 'describe-services', '--cluster', $cluster, '--services') `
        + $names + @('--output', 'json', '--region', $script:AwsRegion)
    $services = @(((Invoke-External -FilePath 'aws' -Arguments $describeServiceArguments).Output | ConvertFrom-Json).services)
    if ($services.Count -ne $names.Count -or @($services | Where-Object { $_.desiredCount -ne $_.runningCount }).Count -gt 0) {
        throw 'ECS desired/running count가 일치하지 않습니다.'
    }
    $dimensions = Resolve-MetricDimensions $outputs
    $rdsIdentifier = Resolve-RdsInstanceIdentifier $outputs
    $targetStates = @(((Invoke-External -FilePath 'aws' -Arguments @(
        'elbv2', 'describe-target-health', '--target-group-arn', $dimensions.TargetGroupArn,
        '--query', 'TargetHealthDescriptions[].TargetHealth.State', '--output', 'json', '--region', $script:AwsRegion
    )).Output | ConvertFrom-Json))
    if ($targetStates.Count -lt 1 -or @($targetStates | Where-Object { $_ -ne 'healthy' }).Count -gt 0) {
        throw 'ALB API target이 모두 healthy가 아닙니다.'
    }
    Assert-Baseline25 $outputs
    Write-Host 'Hybrid preflight PASS'
    [pscustomobject]@{
        Instances = $instances
        Outputs = $outputs
        Fleet = $fleet
        Dimensions = $dimensions
        RdsIdentifier = $rdsIdentifier
    }
}

function Set-ApiLoadtestCapacity {
    param(
        [Parameter(Mandatory = $true)][object]$Context,
        [Parameter(Mandatory = $true)][ValidateRange(1, 3)][int]$Minimum,
        [Parameter(Mandatory = $true)][ValidateRange(1, 3)][int]$Maximum
    )
    if ($Minimum -gt $Maximum) { throw 'API_AUTOSCALING_CAPACITY_INVALID' }
    if ($DryRun) {
        Write-DryRun "API scalable target min=$Minimum max=$Maximum"
        return
    }
    $autoscaling = Get-OutputValue $Context.Outputs 'api_autoscaling'
    $resourceId = [string]$autoscaling.resource_id
    if ($resourceId -notmatch '^service/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$') {
        throw 'API_AUTOSCALING_OUTPUT_INVALID'
    }
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        'application-autoscaling', 'register-scalable-target',
        '--service-namespace', 'ecs', '--resource-id', $resourceId,
        '--scalable-dimension', 'ecs:service:DesiredCount',
        '--min-capacity', $Minimum.ToString(), '--max-capacity', $Maximum.ToString(),
        '--region', $script:AwsRegion
    )
}

function Wait-ApiLoadtestCapacity {
    param([Parameter(Mandatory = $true)][object]$Context)
    if ($DryRun) {
        Write-DryRun 'API ECS desired/running/pending=3/3/0, healthy target=3 확인'
        return [pscustomobject]@{ Desired = 3; Running = 3; Pending = 0; HealthyTargets = 3 }
    }
    $cluster = [string](Get-OutputValue $Context.Outputs 'ecs_cluster_name')
    $serviceNames = Get-OutputValue $Context.Outputs 'ecs_service_names'
    $apiService = [string]$serviceNames.api
    if ([string]::IsNullOrWhiteSpace($cluster) -or [string]::IsNullOrWhiteSpace($apiService)) {
        throw 'API_ECS_OUTPUT_INVALID'
    }
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        'ecs', 'wait', 'services-stable', '--cluster', $cluster, '--services', $apiService,
        '--region', $script:AwsRegion
    )
    $services = @(((Invoke-External -FilePath 'aws' -Arguments @(
        'ecs', 'describe-services', '--cluster', $cluster, '--services', $apiService,
        '--output', 'json', '--region', $script:AwsRegion
    )).Output | ConvertFrom-Json).services)
    if ($services.Count -ne 1) { throw 'API_ECS_CAPACITY_INVALID' }
    $service = $services[0]
    if ($service.desiredCount -ne 3 -or $service.runningCount -ne 3 -or $service.pendingCount -ne 0) {
        throw 'API_ECS_CAPACITY_INVALID'
    }

    $targetStates = @()
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    while ([DateTime]::UtcNow -lt $deadline) {
        $targetStates = @(((Invoke-External -FilePath 'aws' -Arguments @(
            'elbv2', 'describe-target-health', '--target-group-arn', $Context.Dimensions.TargetGroupArn,
            '--query', 'TargetHealthDescriptions[].TargetHealth.State',
            '--output', 'json', '--region', $script:AwsRegion
        )).Output | ConvertFrom-Json))
        if ($targetStates.Count -eq 3 -and @($targetStates | Where-Object { $_ -ne 'healthy' }).Count -eq 0) {
            return [pscustomobject]@{ Desired = 3; Running = 3; Pending = 0; HealthyTargets = 3 }
        }
        Start-Sleep -Seconds 10
    }
    if ($targetStates.Count -ne 3) { throw 'API_ALB_TARGET_COUNT_INVALID' }
    throw 'API_ALB_TARGET_HEALTH_INVALID'
}

function Show-FleetPlan([object]$Fleet) {
    Write-Host 'KEEP (5)'
    foreach ($fleetHost in $Fleet.keep) { Write-Host ("  {0:00} {1}" -f $fleetHost.instanceIndex, $fleetHost.instanceId) }
    Write-Host 'STOP (15)'
    foreach ($fleetHost in $Fleet.stop) { Write-Host ("  {0:00} {1}" -f $fleetHost.instanceIndex, $fleetHost.instanceId) }
}

function Invoke-FleetStop([object]$Context) {
    $fleet = if ($null -ne $Context.Fleet) { $Context.Fleet } else { Get-HybridPlan -Mode fleet -Instances $Context.Instances }
    Show-FleetPlan $fleet
    if ($DryRun) { Write-DryRun 'exact stop candidate 15대만 stop; terminate/destroy 없음'; return }
    # allowlist의 여집합 15대만 stop한다. terminate/destroy 경로는 이 controller에 없다.
    $states = Get-InstanceStateMap -InstanceIds @($fleet.stop | ForEach-Object { $_.instanceId })
    $runningIds = @($fleet.stop | Where-Object { $states[$_.instanceId].State -eq 'running' } | ForEach-Object { $_.instanceId })
    if ($runningIds.Count -gt 0) {
        $null = Invoke-External -FilePath 'aws' -Arguments (@('ec2', 'stop-instances', '--instance-ids') + $runningIds + @('--region', $script:AwsRegion))
        $null = Invoke-External -FilePath 'aws' -Arguments (@('ec2', 'wait', 'instance-stopped', '--instance-ids') + $runningIds + @('--region', $script:AwsRegion))
    }
    $keepStates = Get-InstanceStateMap -InstanceIds @($fleet.keep | ForEach-Object { $_.instanceId })
    if (@($fleet.keep | Where-Object { $keepStates[$_.instanceId].State -ne 'running' }).Count -gt 0) {
        throw '선택 5대 중 running이 아닌 host가 있습니다.'
    }
    Write-Host "Fleet stop PASS: stopped=$($fleet.stop.Count), kept=$($fleet.keep.Count)"
}

function Install-NgrinderHelpers {
    $preparePath = Join-Path $script:PlaywrightToolDirectory 'ngrinder\prepare-input.sh'
    $samplePath = Join-Path $script:PlaywrightToolDirectory 'ngrinder\sample-generator.sh'
    $prepareBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($preparePath))
    $sampleBase64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($samplePath))
    $command = @"
set -euo pipefail
printf '%s' '$prepareBase64' | base64 -d > /usr/local/bin/prepare-ngrinder-hybrid-input
printf '%s' '$sampleBase64' | base64 -d > /usr/local/bin/sample-ngrinder-generator
chmod 0755 /usr/local/bin/prepare-ngrinder-hybrid-input /usr/local/bin/sample-ngrinder-generator
install -d -m 0700 -o ngrinder -g ngrinder /var/lib/ngrinder/hybrid-input /var/lib/ngrinder/hybrid-results
"@
    $null = Invoke-SsmShell -InstanceId $script:NgrinderInstanceId -Command $command
}

function Sync-NgrinderFixture([object]$Outputs) {
    $bucket = Get-OutputValue $Outputs 'playwright_loadtest_bucket_name'
    $command = @"
set -euo pipefail
run_dir='/var/lib/ngrinder/hybrid-input/$RunId'
install -d -m 0700 -o ngrinder -g ngrinder "`$run_dir" "`$run_dir/partitions"
for index in `$(seq -w 1 20); do
  aws s3 cp 's3://$bucket/runs/$RunId/input/instance-'"`$index"'.csv' "`$run_dir/partitions/instance-`$index.csv" --only-show-errors --region '$script:AwsRegion'
done
chown -R ngrinder:ngrinder "`$run_dir"
find "`$run_dir" -type f -exec chmod 0600 {} +
sudo -u ngrinder /usr/local/bin/prepare-ngrinder-hybrid-input "`$run_dir/partitions" 1 "`$run_dir/canary.csv" >/dev/null
"@
    $null = Invoke-SsmShell -InstanceId $script:NgrinderInstanceId -Command $command
}

function Invoke-FixtureApply([object]$Context) {
    if ($DryRun) {
        Write-DryRun "fixture 200 재발급: posting=36, dataset=$DatasetId"
        Write-DryRun 'nGrinder private S3 input 20 partitions download, mode 600'
        return
    }
    & (Join-Path $PSScriptRoot 'playwright-loadtest.ps1') `
        -Action FixtureApply -RunId $RunId -DatasetId $DatasetId -CompanyId $CompanyId -PostingId 36 `
        -ExpectedAwsAccountId $ExpectedAwsAccountId -ConfirmProductionWrite -ConfirmDatasetId $DatasetId
    Install-NgrinderHelpers
    Sync-NgrinderFixture -Outputs $Context.Outputs
    Write-Host 'Fixture apply and nGrinder input sync PASS'
}

function Resolve-SessionManagerPluginDirectory {
    $candidates = [Collections.Generic.List[string]]::new()
    $command = Get-Command 'session-manager-plugin' -ErrorAction SilentlyContinue
    if ($null -ne $command -and -not [string]::IsNullOrWhiteSpace($command.Path)) {
        $candidates.Add((Split-Path -Parent $command.Path))
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $candidates.Add((Join-Path $env:ProgramFiles 'Amazon\SessionManagerPlugin\bin'))
    }
    $portableRoot = 'C:\lt\tools'
    if (Test-Path -LiteralPath $portableRoot) {
        foreach ($directory in @(Get-ChildItem -LiteralPath $portableRoot -Directory -Filter 'session-manager-plugin-*' |
            Sort-Object -Property Name -Descending)) {
            $candidates.Add((Join-Path $directory.FullName 'portable\bin'))
        }
    }
    foreach ($candidate in @($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath (Join-Path $candidate 'session-manager-plugin.exe') -PathType Leaf) {
            return $candidate
        }
    }
    throw 'AWS Session Manager Plugin을 찾을 수 없습니다.'
}

function Start-NgrinderTunnel {
    $probe = [System.Net.Sockets.TcpClient]::new()
    try {
        $alreadyOpen = $probe.ConnectAsync('127.0.0.1', 18080).Wait(200)
    }
    catch { $alreadyOpen = $false }
    finally { $probe.Dispose() }
    if ($alreadyOpen) { throw 'local port 18080이 이미 사용 중입니다.' }
    # Start-Process가 JSON 따옴표를 제거하지 않도록 AWS CLI shorthand를 사용한다.
    $forwardParameters = 'portNumber=8080,localPortNumber=18080'
    $pluginDirectory = Resolve-SessionManagerPluginDirectory
    $pluginProcessIdsBefore = @(Get-Process -Name 'session-manager-plugin' -ErrorAction SilentlyContinue |
        ForEach-Object { [int]$_.Id })
    $originalPath = $env:PATH
    try {
        # aws.exe가 자신의 자식 plugin을 찾도록 이 프로세스 생성 순간에만 PATH를 보강한다.
        $env:PATH = $pluginDirectory + [IO.Path]::PathSeparator + $originalPath
        $session = Start-Process -FilePath 'aws' -ArgumentList @(
            'ssm', 'start-session', '--target', $script:NgrinderInstanceId,
            '--document-name', 'AWS-StartPortForwardingSession', '--parameters', $forwardParameters,
            '--region', $script:AwsRegion
        ) -WindowStyle Hidden -PassThru
    }
    finally {
        $env:PATH = $originalPath
    }
    foreach ($attemptNumber in 1..30) {
        if ($session.HasExited) { throw 'nGrinder SSM tunnel이 조기 종료되었습니다.' }
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            if ($client.ConnectAsync('127.0.0.1', 18080).Wait(500)) {
                $pluginProcessIds = @(Get-Process -Name 'session-manager-plugin' -ErrorAction SilentlyContinue |
                    Where-Object { $pluginProcessIdsBefore -notcontains [int]$_.Id } |
                    ForEach-Object { [int]$_.Id })
                if ($pluginProcessIds.Count -ne 1) {
                    Stop-Process -Id $session.Id -Force -ErrorAction SilentlyContinue
                    foreach ($pluginProcessId in $pluginProcessIds) {
                        Stop-Process -Id $pluginProcessId -Force -ErrorAction SilentlyContinue
                    }
                    throw 'nGrinder SSM tunnel child process 식별 실패'
                }
                return [pscustomobject]@{
                    AwsProcessId = [int]$session.Id
                    PluginProcessIds = $pluginProcessIds
                }
            }
        }
        catch { }
        finally { $client.Dispose() }
        Start-Sleep -Seconds 1
    }
    Stop-Process -Id $session.Id -Force -ErrorAction SilentlyContinue
    $newPluginProcessIds = @(Get-Process -Name 'session-manager-plugin' -ErrorAction SilentlyContinue |
        Where-Object { $pluginProcessIdsBefore -notcontains [int]$_.Id } |
        ForEach-Object { [int]$_.Id })
    foreach ($pluginProcessId in $newPluginProcessIds) {
        Stop-Process -Id $pluginProcessId -Force -ErrorAction SilentlyContinue
    }
    throw 'nGrinder SSM tunnel 준비 timeout'
}

function Stop-NgrinderTunnel([object]$Tunnel) {
    if ($null -eq $Tunnel) { return }
    foreach ($pluginProcessId in @($Tunnel.PluginProcessIds)) {
        Stop-Process -Id ([int]$pluginProcessId) -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id ([int]$Tunnel.AwsProcessId) -Force -ErrorAction SilentlyContinue
}

function Invoke-NgrinderRequest {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('GET', 'POST', 'PUT')][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body,
        [string]$OutFile = ''
    )
    if ($Path -notmatch '^/[A-Za-z0-9_?&=./-]+$') { throw 'nGrinder REST path가 올바르지 않습니다.' }
    # nGrinder REST endpoint는 challenge 없이 anonymous error를 반환하므로 Basic 헤더를 선제 전송한다.
    # 원문 credential/header/response는 로그로 출력하지 않고 이 함수의 고정 오류 코드로만 변환한다.
    $credentialText = $NgrinderCredential.UserName + ':' + $NgrinderCredential.GetNetworkCredential().Password
    $encodedCredential = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($credentialText))
    $credentialText = $null
    $parameters = @{
        Uri = "$script:NgrinderLocalOrigin$Path"
        Method = $Method
        Headers = @{ Authorization = "Basic $encodedCredential" }
        UseBasicParsing = $true
        TimeoutSec = 60
    }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        # Windows PowerShell 5는 큰 문자열을 높은 depth로 직렬화하면 문자열의 확장 속성까지 재귀해 CPU를 소모한다.
        # nGrinder 요청은 body -> fileEntry -> scalar의 최대 3단계이므로 depth 4면 원문을 손실 없이 보존한다.
        $parameters.Body = ($Body | ConvertTo-Json -Depth 4 -Compress)
    }
    if (-not [string]::IsNullOrWhiteSpace($OutFile)) { $parameters.OutFile = $OutFile }
    try {
        Invoke-WebRequest @parameters
    }
    catch {
        $statusCode = 'NO_STATUS'
        if ($null -ne $_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
        }
        # 응답 본문에는 내부 오류와 입력이 섞일 수 있으므로 상태 코드만 보존한다.
        throw "NGRINDER_REST_REQUEST_FAILED:$statusCode"
    }
}

function Publish-NgrinderScript {
    $sourcePath = Join-Path $script:PlaywrightToolDirectory 'ngrinder\hybrid-interview.groovy'
    # Get-Content 결과에는 PSPath 같은 확장 속성이 붙으므로 JSON에서 객체로 변형되지 않게 순수 문자열로 읽는다.
    $source = [System.IO.File]::ReadAllText($sourcePath, [System.Text.Encoding]::UTF8)
    $fileEntry = [ordered]@{
        path = 'hybrid/hybrid-interview.groovy'
        content = $source
        encoding = 'UTF-8'
        description = 'init-jungle hybrid interview API load test'
    }
    $saveBody = [ordered]@{
        fileEntry = $fileEntry
        targetHosts = 'init-jungle.cloud'
        validated = '0'
        createLibAndResource = $false
    }
    $null = Invoke-NgrinderRequest -Method POST -Path '/script/api/save/hybrid/hybrid-interview.groovy' -Body $saveBody
    # REST validation은 테스트 훅까지 실행하므로, 저장된 운영 원문과 별개인 no-load 변형만 검증한다.
    # 이 변형은 API 호출/세션 시작/sleep/결과 쓰기를 모두 건너뛰고 컴파일·라이프사이클 호환성만 확인한다.
    $validationSource = $source.Replace(
        'private static final boolean VALIDATION_ONLY = false',
        'private static final boolean VALIDATION_ONLY = true'
    )
    if ($validationSource -eq $source) { throw 'NGRINDER_VALIDATION_GUARD_MISSING' }
    $validationFileEntry = [ordered]@{
        path = 'hybrid/hybrid-interview.groovy'
        content = $validationSource
        encoding = 'UTF-8'
        description = 'init-jungle hybrid interview API load test validation-only variant'
    }
    $validation = Invoke-NgrinderRequest -Method POST -Path '/script/api/validate' -Body ([ordered]@{
        fileEntry = $validationFileEntry
        hostString = 'init-jungle.cloud'
    })
    # nGrinder 3.5.9-p1은 성공 시에도 validation 실행 로그 전체를 응답 본문으로 반환한다.
    # 본문 유무가 아니라 완료 마커, 1회 실행, 0 errors를 모두 확인해 성공을 판정한다.
    $validationLog = [string]$validation.Content
    if ([string]::IsNullOrWhiteSpace($validationLog) `
        -or $validationLog -notmatch '(?m)^.*finished 1 run\s*$' `
        -or $validationLog -notmatch '(?m)^Totals\s+0\s+0\s+' `
        -or $validationLog -notmatch '(?m)^.*validation-0: Finished\s*$') {
        throw 'NGRINDER_SCRIPT_VALIDATION_INCOMPLETE'
    }
    if ($validationLog -match '(?m)^\d{4}-\d{2}-\d{2}.*\sERROR\s' `
        -or $validationLog -match '(?im)^.*(?:compilation failed|Exception occurs|Caused by:).*$') {
        throw 'NGRINDER_SCRIPT_VALIDATION_ERROR'
    }
}

function Reserve-StageAttempt([object]$Outputs, [int]$StageUsers) {
    if ($DryRun) { Write-DryRun "S3 conditional lock: stage=$StageUsers attempt=$Attempt"; return }
    $bucket = Get-OutputValue $Outputs 'playwright_loadtest_bucket_name'
    $lockPath = New-JsonTempFile ([ordered]@{
        schemaVersion = 'HYBRID_LOADTEST_STAGE_LOCK_V1'
        runId = $RunId
        stageUsers = $StageUsers
        attempt = $Attempt
        reservedAt = [DateTime]::UtcNow.ToString('o')
    })
    try {
        $result = Invoke-External -FilePath 'aws' -Arguments @(
            's3api', 'put-object', '--bucket', $bucket,
            '--key', "runs/$RunId/control/locks/hybrid-stage-$StageUsers-attempt-$Attempt.json",
            '--body', $lockPath, '--content-type', 'application/json', '--server-side-encryption', 'AES256',
            '--if-none-match', '*', '--region', $script:AwsRegion
        ) -AllowFailure
        if ($result.ExitCode -ne 0) { throw 'stage/attempt lock이 이미 존재하거나 예약에 실패했습니다.' }
    }
    finally { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
}

function Initialize-NgrinderAttempt([int]$StageUsers, [long]$BarrierEpoch) {
    $apiUsers = [int]$script:ApiUsers[$StageUsers]
    $stageName = if ($StageUsers -eq 1) { 'canary' } else { "stage-$StageUsers" }
    $command = @"
set -euo pipefail
run_dir='/var/lib/ngrinder/hybrid-input/$RunId'
attempt_dir='/var/lib/ngrinder/hybrid-results/$RunId/$stageName/attempt-$Attempt'
test ! -e "`$attempt_dir"
install -d -m 0700 -o ngrinder -g ngrinder "`$attempt_dir" "`$attempt_dir/vu-results"
sudo -u ngrinder /usr/local/bin/prepare-ngrinder-hybrid-input "`$run_dir/partitions" $apiUsers "`$attempt_dir/input.csv" >/dev/null
printf '%s\n' '$BarrierEpoch' > "`$attempt_dir/start-at-epoch"
chmod 0600 "`$attempt_dir/start-at-epoch"
chown ngrinder:ngrinder "`$attempt_dir/start-at-epoch"
ln -sfn "`$attempt_dir" /var/lib/ngrinder/hybrid-results/current.next
mv -Tf /var/lib/ngrinder/hybrid-results/current.next /var/lib/ngrinder/hybrid-results/current
install -m 0600 -o ngrinder -g ngrinder "`$attempt_dir/input.csv" /var/lib/ngrinder/hybrid-input/current.csv
"@
    $null = Invoke-SsmShell -InstanceId $script:NgrinderInstanceId -Command $command
}

function Start-NgrinderSampler([int]$StageUsers, [long]$BarrierEpoch) {
    $stageName = if ($StageUsers -eq 1) { 'canary' } else { "stage-$StageUsers" }
    $samplerStart = $BarrierEpoch - 10
    $command = @"
set -euo pipefail
attempt_dir='/var/lib/ngrinder/hybrid-results/$RunId/$stageName/attempt-$Attempt'
delay=`$(( $samplerStart - `$(date -u +%s) ))
if [ "`$delay" -lt 0 ]; then delay=0; fi
nohup bash -c "sleep `$delay; exec /usr/local/bin/sample-ngrinder-generator '$RunId' '$StageUsers' '`$attempt_dir/resource-samples.ndjson' 180" >/dev/null 2>&1 &
echo `$! > "`$attempt_dir/sampler.pid"
chmod 0600 "`$attempt_dir/sampler.pid"
chown ngrinder:ngrinder "`$attempt_dir/sampler.pid"
"@
    $null = Invoke-SsmShell -InstanceId $script:NgrinderInstanceId -Command $command
}

function New-NgrinderPerformanceTest([int]$StageUsers, [string]$ScheduledTime) {
    $apiUsers = [int]$script:ApiUsers[$StageUsers]
    $body = [ordered]@{
        testName = "$RunId-hybrid-$StageUsers"
        description = "Hybrid API stage $StageUsers"
        status = 'READY'
        threshold = 'R'
        scm = 'svn'
        scriptName = 'hybrid/hybrid-interview.groovy'
        duration = 240000
        runCount = 5
        agentCount = 1
        processes = 1
        threads = $apiUsers
        vuserPerAgent = $apiUsers
        useRampUp = $false
        ignoreSampleCount = 0
        samplingInterval = 1
        targetHosts = 'init-jungle.cloud'
        scheduledTime = $ScheduledTime
        sendMail = $false
    }
    $response = Invoke-NgrinderRequest -Method POST -Path '/perftest/api' -Body $body
    $created = $response.Content | ConvertFrom-Json
    if ([long]$created.id -lt 1) { throw 'NGRINDER_PERFTEST_CREATE_FAILED' }
    [long]$created.id
}

function Get-NgrinderStatusName([long]$PerformanceTestId) {
    $response = Invoke-NgrinderRequest -Method GET -Path "/perftest/api/$PerformanceTestId/status"
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.status -is [string]) { return [string]$payload.status }
    if ($null -ne $payload.status.name) { return [string]$payload.status.name }
    throw 'NGRINDER_STATUS_INVALID'
}

function Wait-NgrinderPerformanceTest([long]$PerformanceTestId, [long]$BarrierEpoch) {
    # nGrinder duration은 240초이므로 controller 종료/상태 반영을 위한 120초 여유를 둔다.
    $deadline = [DateTimeOffset]::FromUnixTimeSeconds($BarrierEpoch + 360).UtcDateTime
    while ([DateTime]::UtcNow -lt $deadline) {
        $status = Get-NgrinderStatusName $PerformanceTestId
        if ($status -eq 'FINISHED') { return $status }
        if ($status -in @('FINISHED_WITH_WARNING', 'STOP_BY_ERROR', 'STOP_ON_ERROR', 'CANCELED', 'UNKNOWN')) {
            throw "NGRINDER_TERMINAL_$status"
        }
        Start-Sleep -Seconds 5
    }
    try { $null = Invoke-NgrinderRequest -Method PUT -Path "/perftest/api/$PerformanceTestId?action=stop" }
    catch { }
    throw 'NGRINDER_PERFTEST_WATCHDOG'
}

function Send-BrowserStage([object]$Instances, [int]$StageUsers, [long]$BarrierEpoch) {
    $plan = @(Get-HybridPlan -Mode stage -Instances $Instances -StageUsers $StageUsers -StartAtEpoch $BarrierEpoch)
    if ($plan.Count -ne 5) { throw 'BROWSER_PLAN_INVALID' }
    $commands = @()
    try {
        foreach ($browserHost in $plan) {
            $commandLine = @($browserHost.commandArgs | ForEach-Object {
                if ($_ -is [DateTime]) {
                    return ([DateTime]$_).ToUniversalTime().ToString(
                        'yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture
                    )
                }
                if ($_ -is [DateTimeOffset]) {
                    return ([DateTimeOffset]$_).UtcDateTime.ToString(
                        'yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture
                    )
                }
                [string]$_
            }) -join ' '
            $commands += Invoke-SsmShell -InstanceId $browserHost.instanceId -Command $commandLine -TimeoutSeconds 600 -ReturnImmediately
        }
        @($commands)
    }
    catch {
        foreach ($issued in $commands) {
            $null = Invoke-External -FilePath 'aws' -Arguments @(
                'ssm', 'cancel-command', '--command-id', $issued.CommandId,
                '--instance-ids', $issued.InstanceId, '--region', $script:AwsRegion
            ) -AllowFailure
        }
        throw 'BROWSER_DISPATCH_FAILED'
    }
}

function Wait-BrowserStage([object[]]$Commands, [long]$BarrierEpoch) {
    $timeout = [Math]::Max(60, [int](($BarrierEpoch + 300) - [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()))
    foreach ($command in $Commands) {
        $null = Wait-SsmCommand -CommandId $command.CommandId -InstanceId $command.InstanceId -TimeoutSeconds $timeout
    }
}

function Get-NgrinderS3Prefix([int]$StageUsers) {
    if ($StageUsers -eq 1) { return "runs/$RunId/ngrinder/canary/attempt-$Attempt" }
    "runs/$RunId/ngrinder/stage-$StageUsers/attempt-$Attempt"
}

function Export-NgrinderArtifacts {
    param([object]$Outputs, [int]$StageUsers, [long]$PerformanceTestId, [string]$StageDirectory)
    $ngrinderDirectory = Join-Path $StageDirectory 'ngrinder'
    New-Item -ItemType Directory -Path $ngrinderDirectory -Force | Out-Null
    $null = Invoke-NgrinderRequest -Method GET -Path "/perftest/api/$PerformanceTestId/basic_report?imgWidth=1000" -OutFile (Join-Path $ngrinderDirectory 'detail.json')
    $null = Invoke-NgrinderRequest -Method GET -Path "/perftest/$PerformanceTestId/download_csv" -OutFile (Join-Path $ngrinderDirectory 'report.csv')
    $null = Invoke-NgrinderRequest -Method GET -Path "/perftest/api/$PerformanceTestId/logs" -OutFile (Join-Path $ngrinderDirectory 'logs.json')
    $bucket = Get-OutputValue $Outputs 'playwright_loadtest_bucket_name'
    $prefix = Get-NgrinderS3Prefix $StageUsers
    foreach ($name in @('detail.json', 'report.csv', 'logs.json')) {
        $null = Invoke-External -FilePath 'aws' -Arguments @(
            's3', 'cp', (Join-Path $ngrinderDirectory $name), "s3://$bucket/$prefix/$name",
            '--sse', 'AES256', '--only-show-errors', '--region', $script:AwsRegion
        )
    }

    $apiUsers = [int]$script:ApiUsers[$StageUsers]
    $stageName = if ($StageUsers -eq 1) { 'canary' } else { "stage-$StageUsers" }
    $command = @"
set -euo pipefail
attempt_dir='/var/lib/ngrinder/hybrid-results/$RunId/$stageName/attempt-$Attempt'
for wait_count in `$(seq 1 60); do
  sampler_pid=`$(cat "`$attempt_dir/sampler.pid")
  if ! kill -0 "`$sampler_pid" 2>/dev/null; then break; fi
  sleep 5
done
test -s "`$attempt_dir/resource-samples.ndjson"
test "`$(find "`$attempt_dir/vu-results" -maxdepth 1 -type f -name 'vu-*.json' | wc -l)" -eq $apiUsers
aws s3 cp "`$attempt_dir/resource-samples.ndjson" 's3://$bucket/$prefix/resource-samples.ndjson' --sse AES256 --only-show-errors --region '$script:AwsRegion'
aws s3 cp "`$attempt_dir/vu-results/" 's3://$bucket/$prefix/vu-results/' --recursive --sse AES256 --only-show-errors --region '$script:AwsRegion'
"@
    $null = Invoke-SsmShell -InstanceId $script:NgrinderInstanceId -Command $command -TimeoutSeconds 360
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        's3', 'sync', "s3://$bucket/$prefix/", $ngrinderDirectory,
        '--only-show-errors', '--region', $script:AwsRegion
    )
}

function New-CloudWatchQueries([object]$Context) {
    $cluster = Get-OutputValue $Context.Outputs 'ecs_cluster_name'
    $serviceNames = Get-OutputValue $Context.Outputs 'ecs_service_names'
    $alb = $Context.Dimensions.AlbSuffix
    $target = $Context.Dimensions.TargetGroupSuffix
    $definitions = @(
        @{ Id = 'alb_request_count'; Ns = 'AWS/ApplicationELB'; Name = 'RequestCount'; Stat = 'Sum'; Dims = @{ LoadBalancer = $alb } },
        @{ Id = 'api_target_response_time_p50'; Ns = 'AWS/ApplicationELB'; Name = 'TargetResponseTime'; Stat = 'p50'; Dims = @{ LoadBalancer = $alb; TargetGroup = $target } },
        @{ Id = 'api_target_response_time_p95'; Ns = 'AWS/ApplicationELB'; Name = 'TargetResponseTime'; Stat = 'p95'; Dims = @{ LoadBalancer = $alb; TargetGroup = $target } },
        @{ Id = 'api_target_response_time_p99'; Ns = 'AWS/ApplicationELB'; Name = 'TargetResponseTime'; Stat = 'p99'; Dims = @{ LoadBalancer = $alb; TargetGroup = $target } },
        @{ Id = 'api_target_4xx'; Ns = 'AWS/ApplicationELB'; Name = 'HTTPCode_Target_4XX_Count'; Stat = 'Sum'; Dims = @{ LoadBalancer = $alb; TargetGroup = $target } },
        @{ Id = 'alb_5xx'; Ns = 'AWS/ApplicationELB'; Name = 'HTTPCode_ELB_5XX_Count'; Stat = 'Sum'; Dims = @{ LoadBalancer = $alb } },
        @{ Id = 'api_target_5xx'; Ns = 'AWS/ApplicationELB'; Name = 'HTTPCode_Target_5XX_Count'; Stat = 'Sum'; Dims = @{ LoadBalancer = $alb; TargetGroup = $target } },
        @{ Id = 'alb_target_connection_errors'; Ns = 'AWS/ApplicationELB'; Name = 'TargetConnectionErrorCount'; Stat = 'Sum'; Dims = @{ LoadBalancer = $alb } },
        @{ Id = 'api_cpu_average'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Average'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.api } },
        @{ Id = 'api_cpu_maximum'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.api } },
        @{ Id = 'api_memory_average'; Ns = 'AWS/ECS'; Name = 'MemoryUtilization'; Stat = 'Average'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.api } },
        @{ Id = 'api_memory_maximum'; Ns = 'AWS/ECS'; Name = 'MemoryUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.api } },
        @{ Id = 'frontend_cpu_average'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Average'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.frontend } },
        @{ Id = 'frontend_cpu_maximum'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.frontend } },
        @{ Id = 'frontend_memory_average'; Ns = 'AWS/ECS'; Name = 'MemoryUtilization'; Stat = 'Average'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.frontend } },
        @{ Id = 'frontend_memory_maximum'; Ns = 'AWS/ECS'; Name = 'MemoryUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.frontend } },
        @{ Id = 'worker_cpu_average'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Average'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.worker } },
        @{ Id = 'worker_cpu_maximum'; Ns = 'AWS/ECS'; Name = 'CPUUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.worker } },
        @{ Id = 'worker_memory_average'; Ns = 'AWS/ECS'; Name = 'MemoryUtilization'; Stat = 'Average'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.worker } },
        @{ Id = 'worker_memory_maximum'; Ns = 'AWS/ECS'; Name = 'MemoryUtilization'; Stat = 'Maximum'; Dims = @{ ClusterName = $cluster; ServiceName = $serviceNames.worker } },
        @{ Id = 'db_cpu_credit_balance'; Ns = 'AWS/RDS'; Name = 'CPUCreditBalance'; Stat = 'Average'; Dims = @{ DBInstanceIdentifier = $Context.RdsIdentifier } }
    )
    @($definitions | ForEach-Object {
        $dimensions = @($_.Dims.GetEnumerator() | ForEach-Object { @{ Name = $_.Key; Value = $_.Value } })
        @{ Id = $_.Id; ReturnData = $true; MetricStat = @{ Metric = @{ Namespace = $_.Ns; MetricName = $_.Name; Dimensions = $dimensions }; Period = 60; Stat = $_.Stat } }
    })
}

function Collect-CloudWatchStage {
    param([object]$Context, [long]$StartEpoch, [long]$EndEpoch, [string]$StageDirectory)
    $queryPath = New-JsonTempFile (New-CloudWatchQueries $Context)
    $rawPath = Join-Path $StageDirectory 'cloudwatch-raw.json'
    try {
        $result = Invoke-External -FilePath 'aws' -Arguments @(
            'cloudwatch', 'get-metric-data', '--metric-data-queries', "file://$queryPath",
            '--start-time', ([DateTimeOffset]::FromUnixTimeSeconds($StartEpoch - 60).UtcDateTime.ToString('o')),
            '--end-time', ([DateTimeOffset]::FromUnixTimeSeconds($EndEpoch + 120).UtcDateTime.ToString('o')),
            '--scan-by', 'TimestampAscending', '--output', 'json', '--region', $script:AwsRegion
        )
        [System.IO.File]::WriteAllText($rawPath, $result.Output, [System.Text.UTF8Encoding]::new($false))
    }
    finally { Remove-Item -LiteralPath $queryPath -Force -ErrorAction SilentlyContinue }
    $raw = Get-Content -LiteralPath $rawPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $requiredEcsIds = @(
        'api_cpu_average', 'api_cpu_maximum', 'api_memory_average', 'api_memory_maximum',
        'frontend_cpu_average', 'frontend_cpu_maximum', 'frontend_memory_average', 'frontend_memory_maximum',
        'worker_cpu_average', 'worker_cpu_maximum', 'worker_memory_average', 'worker_memory_maximum'
    )
    $requiredIds = @('api_target_response_time_p95', 'alb_5xx', 'api_target_5xx', 'alb_target_connection_errors') + $requiredEcsIds
    $requiredValueIds = @('api_target_response_time_p95') + $requiredEcsIds
    $metricIncomplete = $false
    foreach ($id in $requiredIds) {
        $metric = @($raw.MetricDataResults | Where-Object { $_.Id -ceq $id })
        $valuesProperty = if ($metric.Count -eq 1) { $metric[0].PSObject.Properties['Values'] } else { $null }
        if ($metric.Count -ne 1 -or $metric[0].StatusCode -cne 'Complete' `
            -or ($id -in $requiredValueIds -and ($null -eq $valuesProperty -or @($valuesProperty.Value).Count -lt 1))) {
            $metricIncomplete = $true
        }
    }
    $alb5xx = @($raw.MetricDataResults | Where-Object { $_.Id -ceq 'alb_5xx' })
    $target5xx = @($raw.MetricDataResults | Where-Object { $_.Id -ceq 'api_target_5xx' })
    $connection = @($raw.MetricDataResults | Where-Object { $_.Id -ceq 'alb_target_connection_errors' })
    $p95 = @($raw.MetricDataResults | Where-Object { $_.Id -ceq 'api_target_response_time_p95' })
    [double[]]$alb5xxValues = if ($alb5xx.Count -eq 1 -and $null -ne $alb5xx[0].PSObject.Properties['Values']) { @($alb5xx[0].PSObject.Properties['Values'].Value) } else { @() }
    [double[]]$target5xxValues = if ($target5xx.Count -eq 1 -and $null -ne $target5xx[0].PSObject.Properties['Values']) { @($target5xx[0].PSObject.Properties['Values'].Value) } else { @() }
    [double[]]$connectionValues = if ($connection.Count -eq 1 -and $null -ne $connection[0].PSObject.Properties['Values']) { @($connection[0].PSObject.Properties['Values'].Value) } else { @() }
    [double[]]$p95Values = if ($p95.Count -eq 1 -and $null -ne $p95[0].PSObject.Properties['Values']) { @($p95[0].PSObject.Properties['Values'].Value) } else { @() }
    $albGenerated5xx = [double](($alb5xxValues | Measure-Object -Sum).Sum)
    $albTarget5xx = [double](($target5xxValues | Measure-Object -Sum).Sum)
    $connectionErrors = [double](($connectionValues | Measure-Object -Sum).Sum)
    $apiP95Ms = if ($p95Values.Count -gt 0) { [Math]::Round(([double](($p95Values | Measure-Object -Maximum).Maximum)) * 1000, 3) } else { $null }
    $summary = [ordered]@{
        serverFailure = ($albGenerated5xx -gt 0 -or $albTarget5xx -gt 0 -or $connectionErrors -gt 0)
        metricIncomplete = $metricIncomplete
        alb5xx = $albGenerated5xx
        albTarget5xx = $albTarget5xx
        targetConnectionErrors = $connectionErrors
        apiP95Ms = $apiP95Ms
    }
    $path = Join-Path $StageDirectory 'cloudwatch-summary.json'
    [System.IO.File]::WriteAllText($path, ($summary | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
    $summary
}

function Get-EcsServiceSnapshot {
    param(
        [object]$Context,
        [ValidateSet('api', 'frontend', 'worker')][string]$ServiceKey
    )
    $cluster = [string](Get-OutputValue $Context.Outputs 'ecs_cluster_name')
    $serviceNames = Get-OutputValue $Context.Outputs 'ecs_service_names'
    $serviceName = [string]$serviceNames.$ServiceKey
    if ([string]::IsNullOrWhiteSpace($serviceName)) { throw 'ECS_TASK_EVIDENCE_INCOMPLETE' }
    $serviceResult = Invoke-External -FilePath 'aws' -Arguments @(
        'ecs', 'describe-services', '--cluster', $cluster, '--services', $serviceName,
        '--output', 'json', '--region', $script:AwsRegion
    )
    $services = @((ConvertFrom-Json $serviceResult.Output).services)
    if ($services.Count -ne 1) { throw 'ECS_TASK_EVIDENCE_INCOMPLETE' }
    $primary = @($services[0].deployments | Where-Object { $_.status -ceq 'PRIMARY' })
    if ($primary.Count -ne 1 -or [string]$primary[0].rolloutState -notin @('COMPLETED', 'IN_PROGRESS', 'FAILED')) {
        throw 'ECS_TASK_EVIDENCE_INCOMPLETE'
    }
    $runningResult = Invoke-External -FilePath 'aws' -Arguments @(
        'ecs', 'list-tasks', '--cluster', $cluster, '--service-name', $serviceName,
        '--desired-status', 'RUNNING', '--output', 'json', '--region', $script:AwsRegion
    )
    [pscustomobject]@{
        Desired = [int]$services[0].desiredCount
        Running = [int]$services[0].runningCount
        Pending = [int]$services[0].pendingCount
        Rollout = [string]$primary[0].rolloutState
        TaskArns = @((ConvertFrom-Json $runningResult.Output).taskArns | ForEach-Object { [string]$_ })
    }
}

function Get-EcsServiceTaskEvidence {
    param(
        [object]$Context,
        [ValidateSet('api', 'frontend', 'worker')][string]$ServiceKey,
        [AllowNull()][object]$Before,
        [long]$StartEpoch,
        [long]$EndEpoch
    )
    try {
        if ($null -eq $Before) { throw 'ECS_TASK_EVIDENCE_INCOMPLETE' }
        $after = Get-EcsServiceSnapshot -Context $Context -ServiceKey $ServiceKey
        $cluster = [string](Get-OutputValue $Context.Outputs 'ecs_cluster_name')
        $serviceNames = Get-OutputValue $Context.Outputs 'ecs_service_names'
        $serviceName = [string]$serviceNames.$ServiceKey
        $stoppedResult = Invoke-External -FilePath 'aws' -Arguments @(
            'ecs', 'list-tasks', '--cluster', $cluster, '--service-name', $serviceName,
            '--desired-status', 'STOPPED', '--output', 'json', '--region', $script:AwsRegion
        )
        $stoppedArns = @((ConvertFrom-Json $stoppedResult.Output).taskArns | ForEach-Object { [string]$_ })
        $stopped = @()
        if ($stoppedArns.Count -gt 0) {
            $describeResult = Invoke-External -FilePath 'aws' -Arguments (
                @('ecs', 'describe-tasks', '--cluster', $cluster, '--tasks') + $stoppedArns +
                @('--output', 'json', '--region', $script:AwsRegion)
            )
            $stopped = @((ConvertFrom-Json $describeResult.Output).tasks | Where-Object {
                $stoppedAt = [DateTimeOffset]::Parse([string]$_.stoppedAt).ToUnixTimeSeconds()
                $stoppedAt -ge $StartEpoch -and $stoppedAt -le $EndEpoch
            })
        }
        $safeStopped = @($stopped | ForEach-Object {
            $stopCode = [string]$_.stopCode
            $exitCodes = @($_.containers | Where-Object { $_.essential -eq $true } | ForEach-Object {
                if ($null -eq $_.exitCode) { throw 'ECS_TASK_EVIDENCE_INCOMPLETE' }
                [int]$_.exitCode
            })
            if ([string]::IsNullOrWhiteSpace($stopCode)) { throw 'ECS_TASK_EVIDENCE_INCOMPLETE' }
            [ordered]@{ stopCode = $stopCode; essentialExitCodes = $exitCodes }
        })
        [ordered]@{
            before = [ordered]@{
                desiredCount = $Before.Desired
                runningCount = $Before.Running
                pendingCount = $Before.Pending
                rolloutState = $Before.Rollout
            }
            after = [ordered]@{
                desiredCount = $after.Desired
                runningCount = $after.Running
                pendingCount = $after.Pending
                rolloutState = $after.Rollout
            }
            runningTaskSetChanged = (@($Before.TaskArns | Sort-Object) -join ',') -cne (@($after.TaskArns | Sort-Object) -join ',')
            stoppedTasks = $safeStopped
        }
    }
    catch {
        [ordered]@{ evidenceComplete = $false }
    }
}

function Get-EcsServicesTaskEvidence {
    param(
        [object]$Context,
        [AllowNull()][object]$Before,
        [long]$StartEpoch,
        [long]$EndEpoch
    )
    $services = [ordered]@{}
    foreach ($serviceKey in @('api', 'frontend', 'worker')) {
        $beforeService = if ($null -ne $Before) { $Before[$serviceKey] } else { $null }
        $services[$serviceKey] = Get-EcsServiceTaskEvidence -Context $Context -ServiceKey $serviceKey `
            -Before $beforeService -StartEpoch $StartEpoch -EndEpoch $EndEpoch
    }
    [ordered]@{ services = $services }
}

function Write-S3ObjectIfAbsent([string]$Bucket, [string]$Key, [string]$Path) {
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        's3api', 'put-object', '--bucket', $Bucket, '--key', $Key, '--body', $Path,
        '--server-side-encryption', 'AES256', '--if-none-match', '*', '--region', $script:AwsRegion
    )
}

function Invoke-CloudWatchEvidenceImages {
    param(
        [object]$Context,
        [int]$StageUsers,
        [long]$StartEpoch,
        [long]$EndEpoch,
        [string]$StageDirectory,
        [string]$TaskEvidencePath,
        [string]$OutputDirectory,
        [string]$DestinationPrefix
    )
    $cluster = [string](Get-OutputValue $Context.Outputs 'ecs_cluster_name')
    $serviceNames = Get-OutputValue $Context.Outputs 'ecs_service_names'
    $dimensions = [ordered]@{
        clusterName = $cluster
        serviceNames = [ordered]@{
            api = [string]$serviceNames.api
            frontend = [string]$serviceNames.frontend
            worker = [string]$serviceNames.worker
        }
        loadBalancer = [string]$Context.Dimensions.AlbSuffix
        targetGroup = [string]$Context.Dimensions.TargetGroupSuffix
    }
    $dimensionsPath = New-JsonTempFile $dimensions
    $requestPath = Join-Path $OutputDirectory 'cloudwatch-image-requests.json'
    $imageMetadataPath = Join-Path $OutputDirectory 'cloudwatch-images.json'
    $imageDirectory = Join-Path $OutputDirectory 'cloudwatch-images'
    $startedAtUtc = [DateTimeOffset]::FromUnixTimeSeconds($StartEpoch).UtcDateTime.ToString('o')
    $endedAtUtc = [DateTimeOffset]::FromUnixTimeSeconds($EndEpoch).UtcDateTime.ToString('o')
    try {
        $null = Invoke-External -FilePath 'node' -Arguments @(
            (Join-Path $script:PlaywrightToolDirectory 'scripts\plan-cloudwatch-evidence-images.mjs'),
            "--started-at=$startedAtUtc", "--ended-at=$endedAtUtc",
            "--cloudwatch-raw=$(Join-Path $StageDirectory 'cloudwatch-raw.json')",
            "--ecs-task-evidence=$TaskEvidencePath", "--dimensions=$dimensionsPath",
            "--output=$requestPath"
        )
        $requests = @((Get-Content -LiteralPath $requestPath -Raw -Encoding UTF8 | ConvertFrom-Json))
        New-Item -ItemType Directory -Path $imageDirectory -Force | Out-Null
        $metadata = @()
        foreach ($request in $requests) {
            $fileName = [string]$request.fileName
            if ($fileName -notin @('ecs-resource-utilization.png', 'server-failure-signals.png')) {
                throw 'CLOUDWATCH_IMAGE_PLAN_FAILED'
            }
            $imagePath = Join-Path $imageDirectory $fileName
            $widgetPath = New-JsonTempFile $request.widget
            try {
                $result = Invoke-External -FilePath 'aws' -Arguments @(
                    'cloudwatch', 'get-metric-widget-image',
                    '--metric-widget', "file://$widgetPath",
                    '--output-format', 'png', '--output', 'text', '--region', $script:AwsRegion
                )
                $bytes = [Convert]::FromBase64String($result.Output.Trim())
                if ($bytes.Length -lt 24) { throw 'CLOUDWATCH_IMAGE_GENERATION_FAILED' }
                $signature = [BitConverter]::ToString($bytes, 0, 8).Replace('-', '').ToLowerInvariant()
                if ($signature -cne '89504e470d0a1a0a') { throw 'CLOUDWATCH_IMAGE_GENERATION_FAILED' }
                [System.IO.File]::WriteAllBytes($imagePath, $bytes)
                $sha256 = (Get-FileHash -LiteralPath $imagePath -Algorithm SHA256).Hash.ToLowerInvariant()
                $metadata += [ordered]@{
                    fileName = $fileName
                    status = 'SUCCEEDED'
                    sha256 = $sha256
                    createdAtUtc = [DateTime]::UtcNow.ToString('o')
                    startedAtUtc = [string]$request.widget.start
                    endedAtUtc = [string]$request.widget.end
                    localPath = "cloudwatch-images/$fileName"
                    s3ObjectKey = "${DestinationPrefix}cloudwatch-images/$fileName"
                }
            }
            catch {
                Remove-Item -LiteralPath $imagePath -Force -ErrorAction SilentlyContinue
                $metadata += [ordered]@{
                    fileName = $fileName
                    status = 'FAILED'
                    failureCode = 'CLOUDWATCH_IMAGE_GENERATION_FAILED'
                }
            }
            finally {
                Remove-Item -LiteralPath $widgetPath -Force -ErrorAction SilentlyContinue
            }
        }
        [System.IO.File]::WriteAllText(
            $imageMetadataPath,
            (ConvertTo-Json -InputObject @($metadata) -Depth 20),
            [System.Text.UTF8Encoding]::new($false)
        )
        $imageMetadataPath
    }
    finally {
        Remove-Item -LiteralPath $dimensionsPath -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-BottleneckStageReport {
    param(
        [object]$Context,
        [int]$StageUsers,
        [long]$StartEpoch,
        [long]$EndEpoch,
        [string]$StageDirectory,
        [object]$TaskEvidence,
        [string]$StrictVerdict
    )
    $outputDirectory = Join-Path (Join-Path (Join-Path (Join-Path $ResultsDirectory $RunId) 'stages') $StageUsers) "attempt-$Attempt"
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $bucket = [string](Get-OutputValue $Context.Outputs 'playwright_loadtest_bucket_name')
    $destinationPrefix = "runs/$RunId/stages/$StageUsers/attempt-$Attempt/"
    $taskEvidencePath = New-JsonTempFile $TaskEvidence
    $hybridStagePath = New-JsonTempFile ([ordered]@{ verdict = $StrictVerdict })
    try {
        $imageMetadataPath = Invoke-CloudWatchEvidenceImages -Context $Context -StageUsers $StageUsers `
            -StartEpoch $StartEpoch -EndEpoch $EndEpoch -StageDirectory $StageDirectory `
            -TaskEvidencePath $taskEvidencePath -OutputDirectory $outputDirectory `
            -DestinationPrefix $destinationPrefix
        $null = Invoke-External -FilePath 'node' -Arguments @(
            (Join-Path $script:PlaywrightToolDirectory 'scripts\summarize-bottleneck.mjs'),
            "--run-id=$RunId", "--stage=$StageUsers", "--attempt=$Attempt",
            "--started-at=$([DateTimeOffset]::FromUnixTimeSeconds($StartEpoch).UtcDateTime.ToString('o'))",
            "--ended-at=$([DateTimeOffset]::FromUnixTimeSeconds($EndEpoch).UtcDateTime.ToString('o'))",
            "--api-summary=$(Join-Path $StageDirectory 'api-summary.json')",
            "--browser-summary=$(Join-Path $StageDirectory 'browser-summary.json')",
            "--cloudwatch-raw=$(Join-Path $StageDirectory 'cloudwatch-raw.json')",
            "--ecs-task-evidence=$taskEvidencePath", "--hybrid-stage=$hybridStagePath",
            "--cloudwatch-images=$imageMetadataPath",
            "--output=$outputDirectory"
        )
        foreach ($name in @('bottleneck-summary.json', 'bottleneck-summary.md', 'bottleneck-summary.png', 'cloudwatch-images.json')) {
            Write-S3ObjectIfAbsent -Bucket $bucket -Key ($destinationPrefix + $name) -Path (Join-Path $outputDirectory $name)
        }
        $imageMetadata = @((Get-Content -LiteralPath $imageMetadataPath -Raw -Encoding UTF8 | ConvertFrom-Json))
        foreach ($image in @($imageMetadata | Where-Object { $_.status -ceq 'SUCCEEDED' })) {
            $imageName = [string]$image.fileName
            if ($imageName -notin @('ecs-resource-utilization.png', 'server-failure-signals.png')) {
                throw 'CLOUDWATCH_IMAGE_METADATA_INVALID'
            }
            Write-S3ObjectIfAbsent -Bucket $bucket -Key ([string]$image.s3ObjectKey) `
                -Path (Join-Path (Join-Path $outputDirectory 'cloudwatch-images') $imageName)
        }
    }
    finally {
        Remove-Item -LiteralPath $taskEvidencePath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $hybridStagePath -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-BottleneckFinalReport([object]$Context) {
    $runDirectory = Join-Path $ResultsDirectory $RunId
    $stagePaths = @{}
    foreach ($stage in $script:ApprovedStages) {
        $stagePaths[$stage] = Join-Path (Join-Path (Join-Path (Join-Path $runDirectory 'stages') $stage) "attempt-$Attempt") 'bottleneck-summary.json'
    }
    if (@($script:ApprovedStages | Where-Object { -not (Test-Path -LiteralPath $stagePaths[$_]) }).Count -gt 0) { return }
    $outputDirectory = Join-Path $runDirectory 'summary'
    $bucket = [string](Get-OutputValue $Context.Outputs 'playwright_loadtest_bucket_name')
    $null = Invoke-External -FilePath 'node' -Arguments @(
        (Join-Path $script:PlaywrightToolDirectory 'scripts\summarize-bottleneck-final.mjs'),
        "--run-id=$RunId", "--bucket=$bucket",
        "--stage-50=$($stagePaths[50])", "--stage-100=$($stagePaths[100])", "--stage-200=$($stagePaths[200])",
        "--output=$outputDirectory"
    )
    foreach ($name in @('bottleneck-final.md', 'stage-comparison.png')) {
        Write-S3ObjectIfAbsent -Bucket $bucket -Key "runs/$RunId/summary/$name" -Path (Join-Path $outputDirectory $name)
    }
}

function Save-HybridWindow {
    param([object]$Outputs, [int]$StageUsers, [long]$StartEpoch, [long]$EndEpoch, [string]$Verdict)
    $runDirectory = Join-Path $ResultsDirectory $RunId
    $controlDirectory = Join-Path $runDirectory 'control'
    New-Item -ItemType Directory -Path $controlDirectory -Force | Out-Null
    $path = Join-Path $controlDirectory 'hybrid-stage-windows.json'
    if (Test-Path -LiteralPath $path) {
        $manifest = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($manifest.runId -cne $RunId -or $manifest.schemaVersion -cne 'HYBRID_LOADTEST_WINDOWS_V1') {
            throw 'hybrid stage window manifest가 현재 run과 다릅니다.'
        }
        if (@($manifest.windows | Where-Object { $_.stageUsers -eq $StageUsers -and $_.attempt -eq $Attempt }).Count -gt 0) {
            throw '동일 stage/attempt window를 덮어쓸 수 없습니다.'
        }
        $windows = @($manifest.windows) + @([ordered]@{
            stageUsers = $StageUsers; attempt = $Attempt
            start = [DateTimeOffset]::FromUnixTimeSeconds($StartEpoch).UtcDateTime.ToString('o')
            end = [DateTimeOffset]::FromUnixTimeSeconds($EndEpoch).UtcDateTime.ToString('o')
            verdict = $Verdict
        })
    }
    else {
        $windows = @([ordered]@{
            stageUsers = $StageUsers; attempt = $Attempt
            start = [DateTimeOffset]::FromUnixTimeSeconds($StartEpoch).UtcDateTime.ToString('o')
            end = [DateTimeOffset]::FromUnixTimeSeconds($EndEpoch).UtcDateTime.ToString('o')
            verdict = $Verdict
        })
    }
    $manifest = [ordered]@{ schemaVersion = 'HYBRID_LOADTEST_WINDOWS_V1'; runId = $RunId; windows = $windows }
    [System.IO.File]::WriteAllText($path, ($manifest | ConvertTo-Json -Depth 20), [System.Text.UTF8Encoding]::new($false))
    $bucket = Get-OutputValue $Outputs 'playwright_loadtest_bucket_name'
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        's3', 'cp', $path, "s3://$bucket/runs/$RunId/control/hybrid-stage-windows.json",
        '--sse', 'AES256', '--only-show-errors', '--region', $script:AwsRegion
    )
}

function Invoke-StageCollection {
    param(
        [object]$Context, [int]$StageUsers, [long]$PerformanceTestId,
        [long]$StartEpoch, [long]$EndEpoch, [AllowNull()][object]$TaskEvidence
    )
    $runDirectory = Join-Path $ResultsDirectory $RunId
    $rawDirectory = Join-Path $runDirectory 'raw'
    $stageDirectory = Join-Path $rawDirectory "stage-$StageUsers"
    New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
    Export-NgrinderArtifacts -Outputs $Context.Outputs -StageUsers $StageUsers -PerformanceTestId $PerformanceTestId -StageDirectory $stageDirectory
    $apiSummaryPath = Join-Path $stageDirectory 'api-summary.json'
    $null = Invoke-External -FilePath 'node' -Arguments @(
        (Join-Path $script:PlaywrightToolDirectory 'scripts\summarize-ngrinder.mjs'),
        "--detail=$(Join-Path $stageDirectory 'ngrinder\detail.json')",
        "--csv=$(Join-Path $stageDirectory 'ngrinder\report.csv')",
        "--resources=$(Join-Path $stageDirectory 'ngrinder\resource-samples.ndjson')",
        "--vu-results=$(Join-Path $stageDirectory 'ngrinder\vu-results')",
        "--expected-users=$($script:ApiUsers[$StageUsers])",
        "--barrier-epoch-ms=$($StartEpoch * 1000)", "--output=$apiSummaryPath"
    )
    $cloudWatch = Collect-CloudWatchStage -Context $Context -StartEpoch $StartEpoch -EndEpoch $EndEpoch -StageDirectory $stageDirectory
    $bucket = Get-OutputValue $Context.Outputs 'playwright_loadtest_bucket_name'
    $prefix = Get-NgrinderS3Prefix $StageUsers
    $cloudWatchPath = Join-Path $stageDirectory 'cloudwatch-summary.json'
    foreach ($path in @($apiSummaryPath, $cloudWatchPath)) {
        $null = Invoke-External -FilePath 'aws' -Arguments @(
            's3', 'cp', $path, "s3://$bucket/$prefix/summary/$([IO.Path]::GetFileName($path))",
            '--sse', 'AES256', '--only-show-errors', '--region', $script:AwsRegion
        )
    }
    $apiSummary = Get-Content -LiteralPath $apiSummaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($StageUsers -eq 1) {
        if ($apiSummary.verdict -ceq 'PASSED' -and -not $cloudWatch.serverFailure -and -not $cloudWatch.metricIncomplete) {
            return 'PASSED'
        }
        return 'FAILED'
    }

    $browserDirectory = Join-Path $stageDirectory 'browser'
    New-Item -ItemType Directory -Path $browserDirectory -Force | Out-Null
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        's3', 'sync', "s3://$bucket/runs/$RunId/stages/$StageUsers/attempt-$Attempt/", $browserDirectory,
        '--only-show-errors', '--region', $script:AwsRegion
    )
    $browserSummaryPath = Join-Path $stageDirectory 'browser-summary.json'
    $null = Invoke-External -FilePath 'node' -Arguments @(
        (Join-Path $script:PlaywrightToolDirectory 'scripts\summarize-hybrid-browser.mjs'),
        "--input=$browserDirectory", "--output=$browserSummaryPath"
    )
    $summaryDirectory = Join-Path $runDirectory 'summary'
    $null = Invoke-External -FilePath 'node' -Arguments @(
        (Join-Path $script:PlaywrightToolDirectory 'scripts\summarize-hybrid.mjs'),
        "--baseline=$BaselineSummaryPath", "--input=$rawDirectory", "--output=$summaryDirectory", "--run-id=$RunId"
    )
    $hybrid = Get-Content -LiteralPath (Join-Path $summaryDirectory 'summary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $current = @($hybrid.stages | Where-Object { $_.totalUsers -eq $StageUsers })
    if ($current.Count -ne 1) { return 'FAILED' }
    foreach ($path in @($browserSummaryPath, (Join-Path $summaryDirectory 'summary.json'), (Join-Path $summaryDirectory 'summary.md'))) {
        $destination = if ($path -like "*$([IO.Path]::DirectorySeparatorChar)summary.*") {
            "s3://$bucket/runs/$RunId/summary/$([IO.Path]::GetFileName($path))"
        } else {
            "s3://$bucket/$prefix/summary/$([IO.Path]::GetFileName($path))"
        }
        $null = Invoke-External -FilePath 'aws' -Arguments @(
            's3', 'cp', $path, $destination, '--sse', 'AES256', '--only-show-errors', '--region', $script:AwsRegion
        )
    }
    $strictVerdict = [string]$current[0].verdict
    try {
        Invoke-BottleneckStageReport -Context $Context -StageUsers $StageUsers `
            -StartEpoch $StartEpoch -EndEpoch $EndEpoch -StageDirectory $stageDirectory `
            -TaskEvidence $TaskEvidence -StrictVerdict $strictVerdict
        if ($StageUsers -eq 200) { Invoke-BottleneckFinalReport -Context $Context }
    }
    catch {
        Write-Warning 'BOTTLENECK_SUMMARY_FAILED'
    }
    $strictVerdict
}

function Assert-ApiCanaryEvidence([object]$Outputs) {
    if ($DryRun) { Write-DryRun 'same run/attempt API canary PASSED summary 확인'; return }
    $bucket = Get-OutputValue $Outputs 'playwright_loadtest_bucket_name'
    $directory = Join-Path ([System.IO.Path]::GetTempPath()) ("hybrid-canary-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $directory | Out-Null
    try {
        $apiPath = Join-Path $directory 'api-summary.json'
        $cloudWatchPath = Join-Path $directory 'cloudwatch-summary.json'
        $windowsPath = Join-Path $directory 'hybrid-stage-windows.json'
        foreach ($artifact in @(
            @{ Key = "runs/$RunId/ngrinder/canary/attempt-$Attempt/summary/api-summary.json"; Path = $apiPath },
            @{ Key = "runs/$RunId/ngrinder/canary/attempt-$Attempt/summary/cloudwatch-summary.json"; Path = $cloudWatchPath },
            @{ Key = "runs/$RunId/control/hybrid-stage-windows.json"; Path = $windowsPath }
        )) {
            $null = Invoke-External -FilePath 'aws' -Arguments @(
                's3', 'cp', "s3://$bucket/$($artifact.Key)", $artifact.Path,
                '--only-show-errors', '--region', $script:AwsRegion
            )
        }
        $summary = Get-Content -LiteralPath $apiPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($summary.expectedUsers -ne 1 -or $summary.reportedUsers -ne 1 -or $summary.verdict -cne 'PASSED') {
            throw '같은 run/attempt의 PASSED API canary가 없습니다.'
        }
        $cloudWatch = Get-Content -LiteralPath $cloudWatchPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($cloudWatch.serverFailure -ne $false -or $cloudWatch.metricIncomplete -ne $false) {
            throw 'API canary CloudWatch strict gate가 통과하지 않았습니다.'
        }
        $windows = Get-Content -LiteralPath $windowsPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $window = @($windows.windows | Where-Object {
            [int]$_.stageUsers -eq 1 -and [int]$_.attempt -eq $Attempt -and $_.verdict -ceq 'PASSED'
        })
        if ($windows.runId -cne $RunId -or $window.Count -ne 1) {
            throw '같은 run/attempt의 strict canary window가 없습니다.'
        }
    }
    finally {
        Get-ChildItem -LiteralPath $directory -File -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $directory -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-HybridStage([object]$Context, [int]$StageUsers) {
    if ($DryRun) {
        $apiUsers = $script:ApiUsers[$StageUsers]
        $browserUsers = if ($StageUsers -eq 1) { 0 } else { 5 }
        Write-DryRun "stage=$StageUsers api=$apiUsers browser=$browserUsers hold=150s barrier=aligned-minute+10s watchdog=360s"
        Reserve-StageAttempt -Outputs $null -StageUsers $StageUsers
        if ($StageUsers -ne 1) {
            $plan = @(Get-HybridPlan -Mode stage -Instances $Context.Instances -StageUsers $StageUsers -StartAtEpoch 1786651200)
            foreach ($browserHost in $plan) { Write-DryRun "browser host=$($browserHost.instanceIndex) assigned=1" }
        }
        return $(if ($StageUsers -eq 1) { 'PASSED' } else { 'HYBRID_PASSED' })
    }

    # lock -> 동일 UTC barrier -> API/브라우저 병렬 실행 -> 증거 수집 -> strict verdict 순서다.
    Reserve-StageAttempt -Outputs $Context.Outputs -StageUsers $StageUsers
    $barrierEpoch = Get-AlignedBarrierEpoch
    Initialize-NgrinderAttempt -StageUsers $StageUsers -BarrierEpoch $barrierEpoch
    $scheduledTime = [DateTimeOffset]::FromUnixTimeSeconds($barrierEpoch).UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    Start-NgrinderSampler -StageUsers $StageUsers -BarrierEpoch $barrierEpoch
    $ecsBefore = [ordered]@{}
    if ($StageUsers -ne 1) {
        foreach ($serviceKey in @('api', 'frontend', 'worker')) {
            try { $ecsBefore[$serviceKey] = Get-EcsServiceSnapshot -Context $Context -ServiceKey $serviceKey }
            catch {
                $ecsBefore[$serviceKey] = $null
                Write-Warning 'ECS_TASK_EVIDENCE_INCOMPLETE'
            }
        }
    }
    $tunnel = $null
    $performanceTestId = 0
    $browserCommands = @()
    $workloadFailure = $null
    try {
        $tunnel = Start-NgrinderTunnel
        Publish-NgrinderScript
        $performanceTestId = New-NgrinderPerformanceTest -StageUsers $StageUsers -ScheduledTime $scheduledTime
        if ($StageUsers -ne 1) {
            $browserCommands = @(Send-BrowserStage -Instances $Context.Instances -StageUsers $StageUsers -BarrierEpoch $barrierEpoch)
        }
        $null = Wait-NgrinderPerformanceTest -PerformanceTestId $performanceTestId -BarrierEpoch $barrierEpoch
        if ($StageUsers -ne 1) { Wait-BrowserStage -Commands $browserCommands -BarrierEpoch $barrierEpoch }
    }
    catch {
        $workloadFailure = 'WORKLOAD_EXECUTION_FAILED'
        if ($performanceTestId -gt 0) {
            try { $null = Invoke-NgrinderRequest -Method PUT -Path "/perftest/api/$performanceTestId?action=stop" }
            catch { }
        }
        Write-Warning $workloadFailure
    }
    $endEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $evidenceEndEpoch = [Math]::Max($endEpoch, $barrierEpoch + 1)
    $taskEvidence = $null
    if ($StageUsers -ne 1) {
        $taskEvidence = Get-EcsServicesTaskEvidence -Context $Context -Before $ecsBefore `
            -StartEpoch $barrierEpoch -EndEpoch $evidenceEndEpoch
    }
    $verdict = 'FAILED'
    if ($performanceTestId -gt 0) {
        try {
            $verdict = Invoke-StageCollection -Context $Context -StageUsers $StageUsers `
                -PerformanceTestId $performanceTestId -StartEpoch $barrierEpoch -EndEpoch $evidenceEndEpoch `
                -TaskEvidence $taskEvidence
        }
        catch {
            Write-Warning 'STAGE_COLLECTION_FAILED'
            $verdict = 'FAILED'
        }
    }
    if ($null -ne $workloadFailure) { $verdict = 'FAILED' }
    try {
        Save-HybridWindow -Outputs $Context.Outputs -StageUsers $StageUsers -StartEpoch $barrierEpoch -EndEpoch $evidenceEndEpoch -Verdict $verdict
    }
    finally {
        # 결과 저장이 실패해도 로컬 SSM port-forward 프로세스를 남기지 않는다.
        Stop-NgrinderTunnel $tunnel
    }
    Write-Host "Hybrid stage $StageUsers verdict=$verdict"
    $verdict
}

function Invoke-CollectOnly([object]$Context) {
    if ($DryRun) { Write-DryRun "S3 safe result sync to $ResultsDirectory\$RunId (input excluded)"; return }
    $bucket = Get-OutputValue $Context.Outputs 'playwright_loadtest_bucket_name'
    $destination = Join-Path (Join-Path $ResultsDirectory $RunId) 'collected'
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $null = Invoke-External -FilePath 'aws' -Arguments @(
        's3', 'sync', "s3://$bucket/runs/$RunId/", $destination,
        '--exclude', 'input/*', '--only-show-errors', '--region', $script:AwsRegion
    )
    Write-Host "Collect PASS: $destination"
}

Assert-InputContract

switch ($Action) {
    'Preflight' {
        $null = Assert-Preflight
    }
    'FleetStopPreview' {
        $context = Assert-Preflight
        $fleet = if ($DryRun) { Get-HybridPlan -Mode fleet -Instances $context.Instances } else { $context.Fleet }
        Show-FleetPlan $fleet
    }
    'FleetStop' {
        $context = Assert-Preflight
        Invoke-FleetStop $context
    }
    'FixtureApply' {
        $context = Assert-Preflight
        Invoke-FixtureApply $context
    }
    'ApiCanary' {
        $context = Assert-Preflight
        $verdict = Invoke-HybridStage -Context $context -StageUsers 1
        if ($verdict -cne 'PASSED') { throw 'API canary strict gate 실패' }
    }
    'Run' {
        $context = Assert-Preflight
        Assert-ApiCanaryEvidence $context.Outputs
        $runFailureCode = $null
        $restoreFailure = $false
        try {
            Set-ApiLoadtestCapacity -Context $context -Minimum 3 -Maximum 3
            $null = Wait-ApiLoadtestCapacity -Context $context
            foreach ($stage in $Stages) {
                $verdict = Invoke-HybridStage -Context $context -StageUsers $stage
                if ($verdict -cne 'HYBRID_PASSED') { throw 'HYBRID_STAGE_STRICT_GATE_FAILED' }
                if ($stage -ne $Stages[-1] -and -not $DryRun) { Start-Sleep -Seconds 120 }
            }
        }
        catch {
            $runFailureCode = 'HYBRID_RUN_FAILED'
        }
        finally {
            try {
                Set-ApiLoadtestCapacity -Context $context -Minimum 1 -Maximum 3
            }
            catch {
                $restoreFailure = $true
            }
        }
        if ($restoreFailure) {
            if ($null -ne $runFailureCode) { Write-Warning $runFailureCode }
            throw 'API_AUTOSCALING_RESTORE_FAILED'
        }
        if ($null -ne $runFailureCode) { throw $runFailureCode }
    }
    'Collect' {
        $context = Assert-Preflight
        Invoke-CollectOnly $context
    }
}
