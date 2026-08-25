param(
    [string]$Mensaje = "Actualiza proyecto",
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

Write-Host "Rama objetivo: $Branch"
git checkout $Branch

Write-Host "Preparando cambios..."
git add -A

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No hay cambios nuevos para commitear."
} else {
    Write-Host "Creando commit..."
    git commit -m $Mensaje
}

Write-Host "Subiendo a GitHub..."
git push origin $Branch

Write-Host ""
Write-Host "Listo. Estado actual:"
git status --short --branch
