-- Read-only aggregate evidence. Never emit records, Auth hashes or session tokens.
-- Execute with psql -X -qAt -v ON_ERROR_STOP=1; compare complete output files.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

SELECT format($query$
  SELECT %L, count(*)::text,
    encode(sha256(convert_to(coalesce(
      string_agg(to_jsonb(t)::text, E'\n' ORDER BY to_jsonb(t)::text COLLATE "C"), ''
    ), 'UTF8')), 'hex')
  FROM %I.%I AS t;
$query$, 'TABLE:' || schemaname || '.' || tablename, schemaname, tablename)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename COLLATE "C"
\gexec

-- Exact NUMERIC definitions; no conversion or arithmetic on financial values.
SELECT 'NUMERIC:' || table_name || '.' || column_name,
       numeric_precision::text, numeric_scale::text
FROM information_schema.columns
WHERE table_schema = 'public' AND data_type = 'numeric'
ORDER BY table_name COLLATE "C", column_name COLLATE "C";

SELECT 'CONSTRAINT:' || t.relname || '.' || c.conname,
       c.contype::text, c.convalidated::text,
       encode(sha256(convert_to(pg_get_constraintdef(c.oid), 'UTF8')), 'hex')
FROM pg_constraint AS c
JOIN pg_class AS t ON t.oid = c.conrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
ORDER BY t.relname COLLATE "C", c.conname COLLATE "C";

SELECT 'FUNCTION:' || p.oid::regprocedure::text,
       encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex')
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.oid::regprocedure::text COLLATE "C";

SELECT 'TRIGGER:' || t.relname || '.' || g.tgname, g.tgenabled::text,
       encode(sha256(convert_to(pg_get_triggerdef(g.oid), 'UTF8')), 'hex')
FROM pg_trigger AS g
JOIN pg_class AS t ON t.oid = g.tgrelid
JOIN pg_namespace AS n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND NOT g.tgisinternal
ORDER BY t.relname COLLATE "C", g.tgname COLLATE "C";

SELECT 'INDEX:' || tablename || '.' || indexname,
       encode(sha256(convert_to(indexdef, 'UTF8')), 'hex')
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename COLLATE "C", indexname COLLATE "C";

SELECT 'SEQUENCE:' || sequencename, start_value::text, increment_by::text,
       min_value::text, max_value::text, cycle::text, cache_size::text, last_value::text
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename COLLATE "C";
COMMIT;
