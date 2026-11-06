# Exporta a estrutura do banco Supabase (sem dados) para supabase/schema/.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\exportar-schema.ps1
# A connection string fica no painel do Supabase: botão "Connect" > "Session pooler".

$ErrorActionPreference = "Stop"
$bin = "C:\Program Files\PostgreSQL\18\bin"
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root "supabase\schema"
New-Item -ItemType Directory -Force $out | Out-Null

$url = Read-Host "Cole a connection string (Session pooler, porta 5432)"
# Remove a senha da URL, se houver; ela é pedida separadamente.
$url = $url.Trim() -replace '^(postgres(?:ql)?://[^:/@]+):[^@]*@', '$1@'
$secure = Read-Host "Senha do banco" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
$env:PGSSLMODE = "require"

try {
  Write-Host "Exportando tabelas, funções e regras de acesso..."
  & "$bin\pg_dump.exe" $url --schema-only --no-owner `
    --schema=public --schema=private `
    --file (Join-Path $out "schema.sql")
  if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou" }

  Write-Host "Exportando regras de acesso dos arquivos (storage)..."
  $sql = @"
select format('-- bucket %s (public=%s)', id, public) from storage.buckets order by id;
select format(E'create policy %I on storage.objects as %s for %s to %s%s%s;\n',
  policyname, permissive, cmd, array_to_string(roles, ', '),
  coalesce(' using (' || qual || ')', ''),
  coalesce(' with check (' || with_check || ')', ''))
from pg_policies where schemaname = 'storage' order by policyname;
"@
  & "$bin\psql.exe" $url -At -c $sql --output (Join-Path $out "storage-policies.sql")
  if ($LASTEXITCODE -ne 0) { throw "psql falhou" }

  Write-Host "Pronto. Arquivos em supabase\schema\" -ForegroundColor Green
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
