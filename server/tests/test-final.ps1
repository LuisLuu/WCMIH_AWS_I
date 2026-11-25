
# Project V - Final Security Tests
# Run from the server directory

$base = "http://localhost:3001"

function Show-Test($name, $passed) {
    if ($passed) {
        Write-Host "PASS: $name" -ForegroundColor Green
    } else {
        Write-Host "FAIL: $name" -ForegroundColor Red
    }
}

function Get-HttpStatus($url, $headers = @{}) {
    try {
        $r = Invoke-WebRequest -Uri $url `
            -Headers $headers -UseBasicParsing
        return [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        return 0
    }
}

# TEST 1 - Health
$status = Get-HttpStatus "$base/api/health"
Show-Test "Express Health API" ($status -eq 200)

# TEST 2 - Missing JWT
$status = Get-HttpStatus "$base/api/protected"
Show-Test "JWT Missing Token" ($status -eq 401)

# TEST 3 - Invalid JWT
$status = Get-HttpStatus "$base/api/protected" @{
    Authorization = "Bearer invalid-token"
}
Show-Test "JWT Invalid Token" ($status -eq 401)

# TEST 4 - Valid JWT
$token = node -r dotenv/config -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'demo-user'},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:'15m',issuer:'project-v',audience:'project-v-api'}))"

$status = Get-HttpStatus "$base/api/protected" @{
    Authorization = "Bearer $token"
}
Show-Test "JWT Valid Token" ($status -eq 200)

# TEST 5 - Expired JWT
$expired = node -r dotenv/config -e "const jwt=require('jsonwebtoken');console.log(jwt.sign({sub:'demo-user'},process.env.JWT_SECRET,{algorithm:'HS256',expiresIn:-10,issuer:'project-v',audience:'project-v-api'}))"

$status = Get-HttpStatus "$base/api/protected" @{
    Authorization = "Bearer $expired"
}
Show-Test "JWT Expired Token" ($status -eq 401)

# TEST 6 - Allowed CORS
try {
    $r = Invoke-WebRequest -Uri "$base/api/health" `
        -Headers @{Origin="http://localhost:5173"} `
        -UseBasicParsing
    $allowed = $r.Headers["Access-Control-Allow-Origin"]
    Show-Test "CORS Allowed Origin" ($allowed -eq "http://localhost:5173")
} catch {
    Show-Test "CORS Allowed Origin" $false
}

# TEST 7 - Blocked CORS

# TEST 7 - Blocked CORS
try {
    $r = Invoke-WebRequest `
        -Uri "$base/api/health" `
        -Headers @{ Origin = "http://localhost:9999" } `
        -UseBasicParsing `
        -ErrorAction Stop

    $origin = $r.Headers["Access-Control-Allow-Origin"]

    Show-Test "CORS Blocked Origin" (
        -not $origin
    )
}
catch {
    $response = $_.Exception.Response

    if ($null -ne $response) {
        $origin = $response.Headers[
            "Access-Control-Allow-Origin"
        ]

        Show-Test "CORS Blocked Origin" (
            -not $origin
        )
    }
    else {
        Show-Test "CORS Blocked Origin" $false
    }
}


# TEST 8 and 9 - Mock KMS
node -r dotenv/config -e "const k=require('./src/services/kms');const s='dummy-openai-key';const x=k.encrypt(s);console.log(k.decrypt(x)===s?'PASS: KMS Encrypt/Decrypt':'FAIL: KMS Encrypt/Decrypt');const bad={...x};const t=Buffer.from(bad.tag,'base64');t[0]^=1;bad.tag=t.toString('base64');try{k.decrypt(bad);console.log('FAIL: KMS Tamper Protection')}catch{console.log('PASS: KMS Tamper Protection')}"

# TEST 10 - Git ignore
$ignored = git check-ignore .env 2>$null
$tracked = git ls-files -- .env
Show-Test "ENV Git Protection" (
    [bool]$ignored -and -not [bool]$tracked
)

# TEST 11 - Agent Isolation
$changes = git status --porcelain -- src/agents
Show-Test "AI Agents Unchanged" (-not [bool]$changes)

Write-Host "`nFinal testing finished."
