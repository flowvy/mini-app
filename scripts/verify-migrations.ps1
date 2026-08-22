[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$composeFile = Join-Path $repoRoot "docker-compose.dev.yml"
$databaseName = "flowvy_migration_verify_$(([guid]::NewGuid().ToString('N')).Substring(0, 12))"
$databaseUrlWasSet = Test-Path Env:DATABASE_URL
$previousDatabaseUrl = $env:DATABASE_URL
$pythonPathWasSet = Test-Path Env:PYTHONPATH
$previousPythonPath = $env:PYTHONPATH
$env:PYTHONPATH = Join-Path $backendDir "src"
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

        $sponsorInsertProofSql = @'
BEGIN;

INSERT INTO users (id, username, full_name, role, is_active)
VALUES (300001, 'migration-fixture', 'Migration Fixture', 'USER', true);

WITH profile AS (
    INSERT INTO access_profiles (name, validity_mode, validity_days, fixed_expire_at)
    VALUES ('Migration sponsor profile', 'automation', NULL, NULL)
    RETURNING id
), rule AS (
    INSERT INTO commerce_rules (
        provider,
        name,
        commerce_type,
        payment_mode,
        external_item_id,
        currency,
        calculation_type,
        calculator,
        access_profile_id,
        grant_mode
    )
    SELECT
        'tribute',
        'Migration sponsor rule',
        'donation',
        'one_time',
        NULL,
        'RUB',
        'fixed',
        '{"duration_days": 30}'::jsonb,
        profile.id,
        'extend'
    FROM profile
    RETURNING id
), offer AS (
    INSERT INTO sponsor_offers (
        provider,
        commerce_rule_id,
        title,
        description,
        checkout_url,
        expected_amount_minor,
        expected_payment_mode,
        expected_provider_period,
        is_published,
        sort_order
    )
    SELECT
        'tribute',
        rule.id,
        'Migration sponsor offer',
        '',
        'https://t.me/tribute/app?startapp=migration-proof',
        10000,
        'one_time',
        NULL,
        false,
        100
    FROM rule
    RETURNING id
)
INSERT INTO sponsor_checkouts (
    user_id,
    offer_id,
    provider,
    commerce_type,
    payment_mode,
    external_item_id,
    status,
    offer_snapshot,
    expires_at
)
SELECT
    300001,
    offer.id,
    'tribute',
    'donation',
    'one_time',
    NULL,
    'pending',
    '{}'::jsonb,
    now() + interval '30 minutes'
FROM offer;

ROLLBACK;
'@
        docker exec $containerId psql -U flowvy -d $databaseName -v ON_ERROR_STOP=1 `
            -c $sponsorInsertProofSql
        if ($LASTEXITCODE -ne 0) {
            throw "Migrated sponsor tables or automation-managed access profiles rejected valid runtime data."
        }

        uv run --frozen alembic downgrade z5a6b7c8d9e0
        if ($LASTEXITCODE -ne 0) { throw "Could not return to the localized-content predecessor." }

        $localizedContentSeedSql = @'
INSERT INTO provider_settings (
    id,
    pulse_provider,
    registration_mode,
    tribute_subscription_urls,
    welcome_text,
    welcome_button_text
)
VALUES (1, 'disabled', 'open', '{}'::jsonb, 'Legacy welcome', 'Open legacy app')
ON CONFLICT (id) DO UPDATE SET
    welcome_text = EXCLUDED.welcome_text,
    welcome_button_text = EXCLUDED.welcome_button_text;

INSERT INTO access_profiles (
    id,
    name,
    validity_mode,
    validity_days,
    fixed_expire_at
)
VALUES (
    '30000000-0000-4000-8000-000000000090',
    'Localized content profile',
    'automation',
    NULL,
    NULL
);

INSERT INTO commerce_rules (
    id,
    provider,
    name,
    commerce_type,
    payment_mode,
    external_item_id,
    currency,
    calculation_type,
    calculator,
    access_profile_id,
    grant_mode
)
VALUES (
    '30000000-0000-4000-8000-000000000091',
    'tribute',
    'Localized content rule',
    'donation',
    'one_time',
    NULL,
    'RUB',
    'fixed',
    '{"duration_days": 30}'::jsonb,
    '30000000-0000-4000-8000-000000000090',
    'extend'
);

INSERT INTO sponsor_offers (
    id,
    provider,
    commerce_rule_id,
    title,
    description,
    is_published,
    sort_order
)
VALUES (
    '30000000-0000-4000-8000-000000000092',
    'tribute',
    '30000000-0000-4000-8000-000000000091',
    'Legacy sponsor title',
    'Legacy sponsor description',
    false,
    100
);
'@
        docker exec $containerId psql -U flowvy -d $databaseName -v ON_ERROR_STOP=1 `
            -c $localizedContentSeedSql
        if ($LASTEXITCODE -ne 0) { throw "Could not seed localized-content predecessor data." }

        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Localized-content previous-head upgrade failed." }

        $localizedContentProofSql = @'
SELECT
    (
        SELECT content_default_locale = 'en'
            AND content_locales #>> '{en,welcome_text}' = 'Legacy welcome'
            AND content_locales #>> '{en,welcome_button_text}' = 'Open legacy app'
            AND NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'provider_settings'
                    AND column_name = 'support_url'
            )
        FROM provider_settings
        WHERE id = 1
    ),
    (
        SELECT content_locales #>> '{en,title}' = 'Legacy sponsor title'
            AND content_locales #>> '{en,description}' = 'Legacy sponsor description'
        FROM sponsor_offers
        WHERE id = '30000000-0000-4000-8000-000000000092'
    );
'@
        $localizedContentProof = docker exec $containerId psql -U flowvy -d $databaseName -tA -v ON_ERROR_STOP=1 `
            -c $localizedContentProofSql
        if ($LASTEXITCODE -ne 0 -or $localizedContentProof.Trim() -ne "t|t") {
            throw "Localized-content migration did not preserve English welcome and sponsor copy: $localizedContentProof"
        }

        $localizedContentCleanupSql = @'
DELETE FROM sponsor_offers
WHERE id = '30000000-0000-4000-8000-000000000092';
DELETE FROM commerce_rules
WHERE id = '30000000-0000-4000-8000-000000000091';
DELETE FROM access_profiles
WHERE id = '30000000-0000-4000-8000-000000000090';
'@
        docker exec $containerId psql -U flowvy -d $databaseName -v ON_ERROR_STOP=1 `
            -c $localizedContentCleanupSql
        if ($LASTEXITCODE -ne 0) { throw "Could not clean localized-content migration fixtures." }

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

        uv run --frozen alembic downgrade i9j0k1l2m3n4
        if ($LASTEXITCODE -ne 0) { throw "Could not return to the Beszel migration predecessor." }

        docker exec $containerId psql -U flowvy -d $databaseName -v ON_ERROR_STOP=1 `
            -c "UPDATE provider_settings SET kuma_enabled = true WHERE id = 1;"
        if ($LASTEXITCODE -ne 0) { throw "Could not seed the legacy Kuma-enabled setting." }

        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Beszel previous-head-to-head upgrade failed." }

        $beszelUpgradeProof = docker exec $containerId psql -U flowvy -d $databaseName -tA -v ON_ERROR_STOP=1 `
            -c "SELECT pulse_provider = 'kuma' AND beszel_url IS NULL FROM provider_settings WHERE id = 1;"
        if ($LASTEXITCODE -ne 0 -or $beszelUpgradeProof.Trim() -ne "t") {
            throw "Beszel migration did not preserve the enabled Kuma provider: $beszelUpgradeProof"
        }

        uv run --frozen alembic downgrade i9j0k1l2m3n4
        if ($LASTEXITCODE -ne 0) { throw "Beszel downgrade to its predecessor failed." }

        $beszelDowngradeProof = docker exec $containerId psql -U flowvy -d $databaseName -tA -v ON_ERROR_STOP=1 `
            -c "SELECT kuma_enabled FROM provider_settings WHERE id = 1;"
        if ($LASTEXITCODE -ne 0 -or $beszelDowngradeProof.Trim() -ne "t") {
            throw "Beszel downgrade did not restore the legacy Kuma flag: $beszelDowngradeProof"
        }

        uv run --frozen alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Beszel re-upgrade failed." }

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

    if ($pythonPathWasSet) {
        $env:PYTHONPATH = $previousPythonPath
    }
    else {
        Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    }

    if ($databaseCreated -and $containerId) {
        docker exec $containerId psql -U flowvy -d postgres -v ON_ERROR_STOP=1 `
            -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$databaseName';" | Out-Null
        docker exec $containerId psql -U flowvy -d postgres -v ON_ERROR_STOP=1 `
            -c "DROP DATABASE IF EXISTS $databaseName;" | Out-Null
    }
}

Write-Host "Alembic passed one-head, localized-content backfill, previous-head data upgrades, sponsor UUID inserts, Kuma/Beszel setting preservation, webhook hardening, Remnawave identity preservation, downgrade/re-upgrade, and drift checks."
