-- Emits one MigrationSnapshot as JSON (shape documented in
-- src/lib/region-migration/snapshot.ts). Read-only: safe on a read-only Oregon.
-- Row counts are exact count(*); query_to_xml runs one count per table inside
-- a single SELECT, so no function or temp table is needed.
WITH counted_tables AS (
  SELECT n.nspname AS schema_name, c.relname AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'auth', 'storage')
    AND c.relkind IN ('r', 'p')
    -- The official data dump skips both.
    AND (n.nspname, c.relname) NOT IN (
      ('auth', 'schema_migrations'),
      ('storage', 'migrations')
    )
),
row_counts AS (
  SELECT json_object_agg(
    schema_name || '.' || table_name,
    (xpath(
      '/row/n/text()',
      query_to_xml(
        format('SELECT count(*) AS n FROM %I.%I', schema_name, table_name),
        false, true, ''
      )
    ))[1]::text::bigint
    ORDER BY schema_name, table_name
  ) AS value
  FROM counted_tables
),
relations AS (
  SELECT coalesce(json_agg(json_build_object(
    'name', c.relname,
    'kind', CASE WHEN c.relkind IN ('v', 'm') THEN 'view' ELSE 'table' END,
    'columns', (
      SELECT coalesce(json_agg(a.attname ORDER BY a.attnum), '[]')
      FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    )
  ) ORDER BY c.relname), '[]') AS value
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
),
functions AS (
  SELECT coalesce(json_agg(signature ORDER BY signature), '[]') AS value
  FROM (
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
      AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) public_functions
),
policies AS (
  SELECT coalesce(json_agg(
    json_build_object('table', tablename, 'name', policyname)
    ORDER BY tablename, policyname
  ), '[]') AS value
  FROM pg_policies
  WHERE schemaname = 'public'
),
triggers AS (
  SELECT coalesce(json_agg(
    json_build_object('table', c.relname, 'name', t.tgname)
    ORDER BY c.relname, t.tgname
  ), '[]') AS value
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
),
indexes AS (
  SELECT coalesce(json_agg(indexname ORDER BY indexname), '[]') AS value
  FROM pg_indexes
  WHERE schemaname = 'public'
),
extensions AS (
  SELECT coalesce(json_agg(extname ORDER BY extname), '[]') AS value
  FROM pg_extension
),
migration_versions AS (
  SELECT coalesce(json_agg(version ORDER BY version), '[]') AS value
  FROM supabase_migrations.schema_migrations
)
SELECT json_build_object(
  'rowCounts', coalesce((SELECT value FROM row_counts), '{}'),
  'publicObjects', json_build_object(
    'relations', (SELECT value FROM relations),
    'functions', (SELECT value FROM functions),
    'policies', (SELECT value FROM policies),
    'triggers', (SELECT value FROM triggers),
    'indexes', (SELECT value FROM indexes),
    'extensions', (SELECT value FROM extensions)
  ),
  'migrationVersions', (SELECT value FROM migration_versions)
);
