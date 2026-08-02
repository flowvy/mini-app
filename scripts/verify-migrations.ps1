[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$composeFile = Join-Path $repoRoot "docker-compose.dev.yml"
$databaseName = "flowvy_migration_verify_$(([guid]::NewGuid().ToString('N')).Substring(0, 12))"
$databaseUrlWasSet = Test-Path Env:DATABASE_URL
$previousDatabaseUrl = $env:DATABASE_URL
$containerId = $null
$databaseCreated = $false

docker compose -f $composeFile up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL is not ready for migration verification." }

$containerId = docker compose -f $composeFile ps -q postgres
if ($LASTEXITCODE -ne 0 -or -not $containerId) { throw "Could not resolve the PostgreSQL container." }

try {
    docker exec $containerId psql -U flowvy -d postgres -v ON_ERROR_STOP=1 `
        -c "CREATE DATABASE $databaseName OWNER flowvy;"
    if ($LASTEXITCODE -ne 0) { throw "Could not create disposable migration database." }
    $databaseCreated = $true

    $env:DATABASE_URL = "postgresql+asyncpg://flowvy:flowvy_dev@localhost:5432/$databaseName"

    Push-Location $backendDir
    try {
        $heads = uv run --frozen alembic heads
        if ($LASTEXITCODE -ne 0) { throw "Could not enumerate Alembic heads." }
        $headCount = @($heads | Select-String -Pattern '\(head\)').Count
        if ($headCount -ne 1) { throw "Expected one Alembic head, found $headCount.`n$heads" }

        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Alembic zero-to-head upgrade failed." }

        uv run --frozen alembic downgrade base
        if ($LASTEXITCODE -ne 0) { throw "Alembic downgrade-to-base failed on the disposable database." }

        uv run --frozen alembic upgrade g7h8i9j0k1l2
        if ($LASTEXITCODE -ne 0) { throw "Alembic upgrade to the webhook migration predecessor failed." }

        $legacySeedSql = @'
INSERT INTO webhook_events (scope, event, timestamp, data, received_at)
VALUES (
    'user',
    'user.modified',
    '2026-01-01 00:00:00',
    json_build_object(
        'email', 'legacy@example.test',
        'trojanPassword', 'redact-me'
    ),
    '2026-01-01 00:00:01'
);

INSERT INTO users (id, username, full_name, role, is_active, created_at, updated_at)
VALUES (
    200001,
    'legacy-user',
    'Legacy User',
    'USER',
    true,
    '2026-01-01 00:00:00',
    '2026-01-01 00:00:00'
);

INSERT INTO subscriptions (
    user_id,
    remnawave_uuid,
    status,
    created_at,
    updated_at
)
VALUES (
    200001,
    '550e8400-e29b-41d4-a716-446655440000',
    'ACTIVE',
    '2026-01-01 00:00:00',
    '2026-01-01 00:00:00'
);
'@
        docker exec $containerId psql -U flowvy -d $databaseName -v ON_ERROR_STOP=1 `
            -c $legacySeedSql
        if ($LASTEXITCODE -ne 0) { throw "Could not seed the previous-head webhook fixture." }

        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Alembic previous-head-to-head upgrade failed." }

        $proofSql = @'
SELECT
    (
        SELECT delivery_key LIKE 'legacy:%' AND length(delivery_key) = 64
        FROM webhook_events
        LIMIT 1
    ),
    NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'webhook_events'
          AND column_name = 'data'
    ),
    (
        SELECT pg_typeof(timestamp)::text = 'timestamp with time zone'
        FROM webhook_events
        LIMIT 1
    ),
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'subscriptions'
          AND column_name = 'remnawave_user_id'
          AND data_type = 'bigint'
          AND is_nullable = 'YES'
    ),
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'subscriptions'
          AND indexname = 'ix_subscriptions_remnawave_user_id'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    ),
    EXISTS (
        SELECT 1
        FROM subscriptions
        WHERE user_id = 200001
          AND remnawave_uuid = '550e8400-e29b-41d4-a716-446655440000'
          AND remnawave_user_id IS NULL
    );
'@
        $proof = docker exec $containerId psql -U flowvy -d $databaseName -tA -v ON_ERROR_STOP=1 `
            -c $proofSql
        if ($LASTEXITCODE -ne 0 -or $proof.Trim() -ne "t|t|t|t|t|t") {
            throw "Previous-head migration did not prove webhook hardening and Remnawave identity preservation: $proof"
        }

        uv run --frozen alembic downgrade base
        if ($LASTEXITCODE -ne 0) { throw "Alembic second downgrade-to-base failed." }

        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Alembic second zero-to-head upgrade failed." }

        uv run --frozen alembic check
        if ($LASTEXITCODE -ne 0) { throw "Alembic reports model/migration drift." }
    }
    finally {
        Pop-Location
    }
}
finally {
    if ($databaseUrlWasSet) {
        $env:DATABASE_URL = $previousDatabaseUrl
    }
    else {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    }

    if ($databaseCreated -and $containerId) {
        docker exec $containerId psql -U flowvy -d postgres -v ON_ERROR_STOP=1 `
            -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$databaseName';" | Out-Null
        docker exec $containerId psql -U flowvy -d postgres -v ON_ERROR_STOP=1 `
            -c "DROP DATABASE IF EXISTS $databaseName;" | Out-Null
    }
}

Write-Host "Alembic passed one-head, previous-head data upgrades, webhook hardening, Remnawave identity preservation, downgrade/re-upgrade, and drift checks."
