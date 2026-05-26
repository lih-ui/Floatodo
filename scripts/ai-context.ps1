$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutputDir = Join-Path $ProjectRoot "ai-context"
$OutputFile = Join-Path $OutputDir "floatodo-context.xml"

$CoreFiles = @(
  "package.json",
  "README.md",
  "src/App.tsx",
  "src/styles.css",
  "src/vite-env.d.ts",
  "electron/main.ts",
  "electron/preload.ts",
  "electron/dev-runner.cjs",
  "electron/tsconfig.json",
  "tsconfig.json",
  "vite.config.ts"
)

$MissingFiles = $CoreFiles | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $ProjectRoot $_) -PathType Leaf)
}

if ($MissingFiles.Count -gt 0) {
  Write-Error ("Missing expected Floatodo context files: " + ($MissingFiles -join ", "))
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Push-Location $ProjectRoot
try {
  $IncludePatterns = $CoreFiles -join ","

  & npx.cmd repomix@latest `
    --include $IncludePatterns `
    --style xml `
    --parsable-style `
    --output "ai-context\floatodo-context.xml" `
    --ignore "node_modules/**,dist/**,dist-electron/**,floatodo/**,floatodo1/**,ai-context/**,.env,.env.*,*.local,*.db,*.sqlite,*.sqlite3"
}
finally {
  Pop-Location
}

Write-Host "Floatodo AI context written to: $OutputFile"
