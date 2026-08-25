param(
    [string]$Branch = "actualizacion"
)

$ErrorActionPreference = "Stop"

$DefaultProjectPath = "C:\cotizaciones"
$ProjectPath = if (Test-Path (Join-Path $DefaultProjectPath ".git")) {
    $DefaultProjectPath
} else {
    $PSScriptRoot
}

Set-Location $ProjectPath

Write-Host "Actualizando codigo desde GitHub..."
git fetch origin
git checkout $Branch
git pull origin $Branch

if (-not (Test-Path ".env")) {
    Write-Host "No existe .env. Creando .env local de prueba..."
@"
DATABASE_URL=postgresql://cotizaciones:cotizaciones@postgres:5432/cotizaciones?schema=public
POSTGRES_DB=cotizaciones
POSTGRES_USER=cotizaciones
POSTGRES_PASSWORD=cotizaciones
JWT_SECRET=change_me
PORT=5001
NEXT_PUBLIC_API_URL=http://localhost:5001
BOOTSTRAP_ADMIN_EMAIL=admin@sieza.mx
BOOTSTRAP_ADMIN_PASSWORD=change_me
AI_PROVIDER_NAME=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_AI_ASSISTANT_MODEL=claude-haiku-4-5-20251001
OPENAI_API_KEY=
OPENAI_AI_ASSISTANT_MODEL=gpt-4.1-mini
"@ | Set-Content -Encoding UTF8 -Path ".env"
}

Write-Host "Levantando PostgreSQL..."
docker compose --env-file .env up -d postgres
Start-Sleep -Seconds 8

Write-Host "Aplicando migraciones..."
docker compose --env-file .env run --rm api npx prisma migrate deploy

Write-Host "Reconstruyendo y levantando sistema..."
docker compose --env-file .env up -d --build

Write-Host ""
Write-Host "Actualizacion terminada."
Write-Host "Web: http://localhost:3002"
Write-Host "API: http://localhost:5001"
