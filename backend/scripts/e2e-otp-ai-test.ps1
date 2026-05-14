$ErrorActionPreference = "Stop"

function Read-Required([string]$prompt) {
    while ($true) {
        $value = Read-Host $prompt
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value.Trim()
        }
        Write-Host "Value is required." -ForegroundColor Yellow
    }
}

function Invoke-ApiJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][object]$Body,
        [hashtable]$Headers
    )

    return Invoke-RestMethod -Method $Method -Uri $Url -ContentType "application/json" -Headers $Headers -Body ($Body | ConvertTo-Json -Depth 10)
}

function Test-Health([string]$apiBase) {
    try {
        $resp = Invoke-RestMethod -Method GET -Uri "$apiBase/health"
        if (-not $resp.ok) {
            throw "Health endpoint returned unexpected response."
        }
        Write-Host "API health check passed." -ForegroundColor Green
    } catch {
        throw "API is not reachable at $apiBase. Start backend first."
    }
}

Write-Host "=== CivicPulse E2E OTP + AI Test ===" -ForegroundColor Cyan
$apiBase = Read-Host "API base URL (default: http://localhost:4000/api)"
if ([string]::IsNullOrWhiteSpace($apiBase)) {
    $apiBase = "http://localhost:4000/api"
}
$apiBase = $apiBase.Trim().TrimEnd("/")

Test-Health $apiBase

$flow = Read-Host "Choose OTP flow: register/login (default: register)"
if ([string]::IsNullOrWhiteSpace($flow)) {
    $flow = "register"
}
$flow = $flow.Trim().ToLowerInvariant()
if ($flow -ne "register" -and $flow -ne "login") {
    throw "Invalid flow. Use register or login."
}

$identifier = Read-Required "Enter phone or email identifier"
$password = Read-Required "Enter password"

$token = $null

if ($flow -eq "register") {
    $name = Read-Required "Enter name"
    $wardName = Read-Host "Ward (optional)"
    $area = Read-Host "Area (optional)"
    $address = Read-Host "Address (optional)"
    $pincode = Read-Host "Pincode (optional)"

    $isEmail = $identifier.Contains("@")
    $reqBody = @{
        name = $name
        password = $password
    }
    if ($isEmail) {
        $reqBody.email = $identifier
    } else {
        $reqBody.phone = $identifier
    }
    if (-not [string]::IsNullOrWhiteSpace($wardName)) { $reqBody.wardName = $wardName.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($area)) { $reqBody.area = $area.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($address)) { $reqBody.address = $address.Trim() }
    if (-not [string]::IsNullOrWhiteSpace($pincode)) { $reqBody.pincode = $pincode.Trim() }

    Write-Host "Requesting registration OTP..." -ForegroundColor Cyan
    $otpReqResp = Invoke-ApiJson -Method POST -Url "$apiBase/auth/citizen/request-register-otp" -Body $reqBody
    Write-Host ("Server: " + $otpReqResp.message)

    $otp = $null
    if ($otpReqResp.PSObject.Properties.Name -contains "devOtp") {
        $otp = [string]$otpReqResp.devOtp
        Write-Host "Using dev OTP from response: $otp" -ForegroundColor Yellow
    } else {
        $otp = Read-Required "Enter OTP received by user"
    }

    $verifyResp = Invoke-ApiJson -Method POST -Url "$apiBase/auth/citizen/verify-register-otp" -Body @{
        identifier = $identifier
        otp = $otp
    }
    $token = $verifyResp.token
    Write-Host ("Registered and logged in as: " + $verifyResp.user.name) -ForegroundColor Green
}

if ($flow -eq "login") {
    Write-Host "Requesting login OTP..." -ForegroundColor Cyan
    $otpReqResp = Invoke-ApiJson -Method POST -Url "$apiBase/auth/citizen/request-login-otp" -Body @{
        identifier = $identifier
        password = $password
    }
    Write-Host ("Server: " + $otpReqResp.message)

    $otp = $null
    if ($otpReqResp.PSObject.Properties.Name -contains "devOtp") {
        $otp = [string]$otpReqResp.devOtp
        Write-Host "Using dev OTP from response: $otp" -ForegroundColor Yellow
    } else {
        $otp = Read-Required "Enter OTP received by user"
    }

    $verifyResp = Invoke-ApiJson -Method POST -Url "$apiBase/auth/citizen/verify-login-otp" -Body @{
        identifier = $identifier
        otp = $otp
    }
    $token = $verifyResp.token
    Write-Host ("Logged in as: " + $verifyResp.user.name) -ForegroundColor Green
}

if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Token was not obtained from OTP flow."
}

$authHeaders = @{ Authorization = "Bearer $token" }

Write-Host ""
Write-Host "--- AI Suggest Category Test ---" -ForegroundColor Cyan
$description = Read-Host "Issue description for AI suggestion"
$photoPath = Read-Host "Photo path (optional, local file path)"

$form = @{
    description = $description
}
if (-not [string]::IsNullOrWhiteSpace($photoPath)) {
    if (-not (Test-Path -LiteralPath $photoPath)) {
        throw "Photo file not found: $photoPath"
    }
    $form.photo = Get-Item -LiteralPath $photoPath
}

$suggestResp = Invoke-RestMethod -Method POST -Uri "$apiBase/ai/suggest-category" -Headers $authHeaders -Form $form
Write-Host "AI Suggest Result:" -ForegroundColor Green
$suggestResp | ConvertTo-Json -Depth 10

Write-Host ""
Write-Host "--- Optional Staff-only AI Summary Test ---" -ForegroundColor Cyan
$runSummary = Read-Host "Run summarize-issue API test? yes/no (default: no)"
$runSummaryValue = ""
if ($null -ne $runSummary) {
    $runSummaryValue = $runSummary
}
if ($runSummaryValue.Trim().ToLowerInvariant() -eq "yes") {
    $staffIdentifier = Read-Required "Staff identifier (email/phone)"
    $staffPassword = Read-Required "Staff password"
    $staffLoginResp = Invoke-ApiJson -Method POST -Url "$apiBase/auth/login" -Body @{
        identifier = $staffIdentifier
        password = $staffPassword
    }
    $staffHeaders = @{ Authorization = "Bearer $($staffLoginResp.token)" }
    $summaryResp = Invoke-ApiJson -Method POST -Url "$apiBase/ai/summarize-issue" -Headers $staffHeaders -Body @{
        title = "Road issue in ward"
        description = if ([string]::IsNullOrWhiteSpace($description)) { "Large pothole near bus stop causing traffic delays." } else { $description }
        category = "pothole"
        wardName = "Kasaba"
        severity = "high"
    }
    Write-Host "AI Summary Result:" -ForegroundColor Green
    $summaryResp | ConvertTo-Json -Depth 10
}

Write-Host ""
Write-Host "E2E OTP + AI flow completed successfully." -ForegroundColor Green
