param(
  [string]$ApiBaseUrl = $(if ($env:AUTH_E2E_API_BASE_URL) { $env:AUTH_E2E_API_BASE_URL } else { "http://127.0.0.1:3001/api/v1" }),
  [string]$FrontendBaseUrl = $(if ($env:AUTH_E2E_FRONTEND_BASE_URL) { $env:AUTH_E2E_FRONTEND_BASE_URL } else { "http://127.0.0.1:3000" }),
  [string]$MailpitBaseUrl = $(if ($env:AUTH_E2E_MAILPIT_BASE_URL) { $env:AUTH_E2E_MAILPIT_BASE_URL } else { "http://127.0.0.1:8025" }),
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Step {
  param([string]$Message)
  Write-Host "[e2e] $Message"
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) {
    throw $Message
  }
}

function ConvertFrom-JsonBody {
  param([string]$Body)
  if (-not $Body) {
    return $null
  }
  return $Body | ConvertFrom-Json
}

function Invoke-TestHttp {
  param(
    [string]$Method,
    [string]$Uri,
    [object]$Body,
    [hashtable]$Headers,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session
  )

  $requestArgs = @{
    Uri = $Uri
    Method = $Method
    TimeoutSec = 15
    UseBasicParsing = $true
  }
  if ($null -ne $Session) {
    $requestArgs.WebSession = $Session
  }
  if ($null -ne $Headers) {
    $requestArgs.Headers = $Headers
  }
  if ($null -ne $Body) {
    $requestArgs.ContentType = "application/json"
    $requestArgs.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    $response = Invoke-WebRequest @requestArgs
    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Body = $response.Content
      Headers = $response.Headers
    }
  } catch {
    $errorResponse = $_.Exception.Response
    if ($null -eq $errorResponse) {
      throw
    }
    $bodyText = $_.ErrorDetails.Message
    $stream = $errorResponse.GetResponseStream()
    if ($null -ne $stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $streamText = $reader.ReadToEnd()
      $reader.Close()
      if (-not $bodyText) {
        $bodyText = $streamText
      }
    }
    return [pscustomobject]@{
      StatusCode = [int]$errorResponse.StatusCode
      Body = $bodyText
      Headers = $errorResponse.Headers
    }
  }
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body,
    [hashtable]$Headers,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session
  )

  return Invoke-TestHttp -Method $Method -Uri "$($ApiBaseUrl.TrimEnd("/"))$Path" -Body $Body -Headers $Headers -Session $Session
}

function Expect-Status {
  param([object]$Response, [int]$Expected, [string]$Label)
  if ($Response.StatusCode -ne $Expected) {
    throw "$Label expected HTTP $Expected, got $($Response.StatusCode): $($Response.Body)"
  }
}

function Get-Data {
  param([object]$Response)
  $json = ConvertFrom-JsonBody $Response.Body
  return $json.data
}

function Wait-HttpOk {
  param([string]$Uri, [string]$Label)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-TestHttp -Method "GET" -Uri $Uri
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        return
      }
    } catch {
      # Keep polling until the timeout.
    }
    Start-Sleep -Seconds 2
  } until ((Get-Date) -gt $deadline)
  throw "$Label did not become ready: $Uri"
}

function Get-ObjectProperty {
  param([object]$Object, [string]$Name)
  if ($null -eq $Object) {
    return $null
  }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }
  return $property.Value
}

function Get-LatestMailCode {
  param([string]$Email)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    $messagesResponse = Invoke-RestMethod -Uri "$($MailpitBaseUrl.TrimEnd("/"))/api/v1/messages?limit=50" -Method GET -TimeoutSec 10
    $messages = @(Get-ObjectProperty $messagesResponse "messages")
    foreach ($message in $messages) {
      $messageText = $message | ConvertTo-Json -Depth 10
      if ($messageText -notlike "*$Email*") {
        continue
      }

      $id = Get-ObjectProperty $message "ID"
      if (-not $id) {
        $id = Get-ObjectProperty $message "Id"
      }
      if (-not $id) {
        continue
      }

      $detail = Invoke-RestMethod -Uri "$($MailpitBaseUrl.TrimEnd("/"))/api/v1/message/$id" -Method GET -TimeoutSec 10
      $codeSources = @(
        (Get-ObjectProperty $detail "Text"),
        (Get-ObjectProperty $detail "HTML"),
        (Get-ObjectProperty $detail "Snippet"),
        (Get-ObjectProperty $message "Snippet"),
        (Get-ObjectProperty $detail "Subject"),
        (Get-ObjectProperty $message "Subject")
      )
      foreach ($source in $codeSources) {
        if ($null -ne $source -and ([string]$source) -match '(?<!\d)(\d{6})(?!\d)') {
          return $matches[1]
        }
      }
    }
    Start-Sleep -Seconds 2
  } until ((Get-Date) -gt $deadline)

  throw "Verification code email was not found in Mailpit for $Email"
}

function Run-Signup-Login-Flow {
  param(
    [ValidateSet("COMPANY", "CANDIDATE")]
    [string]$UserType,
    [string]$Email,
    [string]$Password,
    [string]$CompanyName
  )

  Write-Step "$UserType email verification"
  $send = Invoke-Api -Method "POST" -Path "/auth/email/send-code" -Body @{ email = $Email }
  Expect-Status $send 200 "$UserType send email code"
  $code = Get-LatestMailCode -Email $Email

  $verify = Invoke-Api -Method "POST" -Path "/auth/email/verify-code" -Body @{ email = $Email; code = $code }
  Expect-Status $verify 200 "$UserType verify email code"

  Write-Step "$UserType signup"
  $signupBody = @{
    email = $Email
    code = $code
    password = $Password
    passwordConfirm = $Password
    name = "E2E $UserType"
    termsAgreed = $true
  }
  $signupPath = "/auth/signup/candidate"
  if ($UserType -eq "COMPANY") {
    $signupPath = "/auth/signup/company"
    $signupBody.companyName = $CompanyName
  }
  $signup = Invoke-Api -Method "POST" -Path $signupPath -Body $signupBody
  Expect-Status $signup 201 "$UserType signup"
  $signupData = Get-Data $signup
  Assert-True ($signupData.userType -eq $UserType) "$UserType signup returned wrong userType"

  Write-Step "$UserType login and /auth/me"
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $login = Invoke-Api -Method "POST" -Path "/auth/login" -Body @{ userType = $UserType; email = $Email; password = $Password } -Session $session
  Expect-Status $login 200 "$UserType login"
  $loginData = Get-Data $login
  Assert-True ([string]::IsNullOrWhiteSpace($loginData.accessToken) -eq $false) "$UserType login did not return accessToken"
  Assert-True ($loginData.user.userType -eq $UserType) "$UserType login returned wrong userType"

  $me = Invoke-Api -Method "GET" -Path "/auth/me" -Headers @{ Authorization = "Bearer $($loginData.accessToken)" } -Session $session
  Expect-Status $me 200 "$UserType /auth/me"
  $meData = Get-Data $me
  Assert-True ($meData.userType -eq $UserType) "$UserType /auth/me returned wrong userType"

  return [pscustomobject]@{
    Email = $Email
    Password = $Password
    Session = $session
    AccessToken = $loginData.accessToken
  }
}

$ApiBaseUrl = $ApiBaseUrl.TrimEnd("/")
$FrontendBaseUrl = $FrontendBaseUrl.TrimEnd("/")
$MailpitBaseUrl = $MailpitBaseUrl.TrimEnd("/")
$runId = Get-Date -Format "yyyyMMddHHmmssfff"
$candidateEmail = "e2e.candidate.$runId@example.com"
$companyEmail = "e2e.company.$runId@example.com"
$password = "Init2026A"
$newPassword = "Init2026B"
$companyName = "E2E Company $runId"

Write-Step "waiting for API, frontend, and Mailpit"
Wait-HttpOk -Uri "$ApiBaseUrl/health" -Label "API"
Wait-HttpOk -Uri "$FrontendBaseUrl/login" -Label "Frontend"
Wait-HttpOk -Uri "$MailpitBaseUrl/api/v1/messages" -Label "Mailpit"

Write-Step "frontend T1/M1 route smoke"
foreach ($route in @("/login", "/signup", "/signup/candidate", "/signup/company", "/password/reset", "/company/applications/dashboard", "/candidate/mock-interview/start")) {
  $routeResponse = Invoke-TestHttp -Method "GET" -Uri "$FrontendBaseUrl$route"
  Expect-Status $routeResponse 200 "frontend $route"
}

$candidate = Run-Signup-Login-Flow -UserType "CANDIDATE" -Email $candidateEmail -Password $password
$company = Run-Signup-Login-Flow -UserType "COMPANY" -Email $companyEmail -Password $password -CompanyName $companyName

Write-Step "password reset"
$sendReset = Invoke-Api -Method "POST" -Path "/auth/password/send-code" -Body @{ email = $candidate.Email }
Expect-Status $sendReset 200 "password send code"
$resetCode = Get-LatestMailCode -Email $candidate.Email

$verifyReset = Invoke-Api -Method "POST" -Path "/auth/password/verify-code" -Body @{ email = $candidate.Email; code = $resetCode }
Expect-Status $verifyReset 200 "password verify code"

$reset = Invoke-Api -Method "POST" -Path "/auth/password/reset" -Body @{ email = $candidate.Email; code = $resetCode; password = $newPassword; passwordConfirm = $newPassword }
Expect-Status $reset 200 "password reset"

$candidateResetSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$resetLogin = Invoke-Api -Method "POST" -Path "/auth/login" -Body @{ userType = "CANDIDATE"; email = $candidate.Email; password = $newPassword } -Session $candidateResetSession
Expect-Status $resetLogin 200 "candidate login after password reset"

Write-Step "Google OAuth candidate-only policy"
$companyGoogle = Invoke-Api -Method "GET" -Path "/auth/google?userType=COMPANY"
Expect-Status $companyGoogle 403 "company Google login"
$companyGoogleJson = ConvertFrom-JsonBody $companyGoogle.Body
Assert-True ($companyGoogleJson.error.code -eq "AUTH_USER_TYPE_MISMATCH") "company Google login did not return AUTH_USER_TYPE_MISMATCH"

$candidateGoogle = Invoke-Api -Method "GET" -Path "/auth/google?userType=CANDIDATE"
Assert-True (($candidateGoogle.StatusCode -eq 200) -or ($candidateGoogle.StatusCode -eq 400)) "candidate Google login expected 200 or config validation 400, got $($candidateGoogle.StatusCode)"
if ($candidateGoogle.StatusCode -eq 200) {
  $candidateGoogleData = Get-Data $candidateGoogle
  Assert-True ($candidateGoogleData.authorizationUrl -like "*state=CANDIDATE*") "candidate Google authorizationUrl does not include CANDIDATE state"
} else {
  $candidateGoogleJson = ConvertFrom-JsonBody $candidateGoogle.Body
  Assert-True ($candidateGoogleJson.error.code -eq "COMMON_VALIDATION_FAILED") "candidate Google login failed for an unexpected reason"
}

Write-Host "[ok] auth e2e passed"
Write-Host "  candidate: $candidateEmail"
Write-Host "  company:   $companyEmail"
