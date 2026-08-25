$ErrorActionPreference = "Stop"

$DefaultProjectPath = "C:\cotizaciones"
$ProjectPath = if (Test-Path (Join-Path $DefaultProjectPath "docker-compose.yml")) {
    $DefaultProjectPath
} else {
    $PSScriptRoot
}

$BackupDir = Join-Path $ProjectPath "backups"
$DatabaseName = "cotizaciones"
$DatabaseUser = "cotizaciones"
$PostgresService = "postgres"

Set-Location $ProjectPath
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

Write-Host "Levantando PostgreSQL si no esta activo..."
docker compose up -d $PostgresService

Write-Host "Buscando contenedor de PostgreSQL..."
$ContainerId = docker compose ps -q $PostgresService
if ([string]::IsNullOrWhiteSpace($ContainerId)) {
    $ContainerId = "cotizaciones-postgres"
}

$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "cotizaciones_$Stamp.sql"
$ContainerFile = "/tmp/cotizaciones_$Stamp.sql"

Write-Host "Creando respaldo dentro del contenedor..."
docker exec $ContainerId sh -c "pg_dump -U $DatabaseUser -d $DatabaseName --clean --if-exists --no-owner --no-privileges > $ContainerFile"

Write-Host "Copiando respaldo a $BackupFile..."
docker cp "${ContainerId}:$ContainerFile" $BackupFile
docker exec $ContainerId rm -f $ContainerFile

$Result = Get-Item $BackupFile
Write-Host ""
Write-Host "Respaldo creado correctamente:"
Write-Host $Result.FullName
Write-Host "Tamano: $($Result.Length) bytes"
