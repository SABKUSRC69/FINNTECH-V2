-- Only the seven exact PostgreSQL 18 cast rewrites below are canonicalized; unknown definitions still fail comparison.
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
       encode(sha256(convert_to(CASE
  WHEN t.relname = 'auth_delivery_jobs' AND c.conname = 'delivery_kind' AND pg_get_constraintdef(c.oid) IN (
    'CHECK (((kind)::text = ANY ((ARRAY[''verify''::character varying, ''reset''::character varying, ''notice''::character varying])::text[])))',
    'CHECK (((kind)::text = ANY (ARRAY[(''verify''::character varying)::text, (''reset''::character varying)::text, (''notice''::character varying)::text])))')
    THEN 'CHECK kind = ANY text[verify,reset,notice]'
  WHEN t.relname = 'auth_delivery_jobs' AND c.conname = 'delivery_status' AND pg_get_constraintdef(c.oid) IN (
    'CHECK (((status)::text = ANY ((ARRAY[''PENDING''::character varying, ''SENT''::character varying, ''EXPIRED''::character varying, ''FAILED''::character varying])::text[])))',
    'CHECK (((status)::text = ANY (ARRAY[(''PENDING''::character varying)::text, (''SENT''::character varying)::text, (''EXPIRED''::character varying)::text, (''FAILED''::character varying)::text])))')
    THEN 'CHECK status = ANY text[PENDING,SENT,EXPIRED,FAILED]'
  WHEN t.relname = 'stock_instruments' AND c.conname = 'instrument_identity' AND pg_get_constraintdef(c.oid) IN (
    'CHECK ((((currency)::text = ''USD''::text) AND ((kind)::text = ANY ((ARRAY[''STOCK''::character varying, ''ETF''::character varying])::text[]))))',
    'CHECK ((((currency)::text = ''USD''::text) AND ((kind)::text = ANY (ARRAY[(''STOCK''::character varying)::text, (''ETF''::character varying)::text]))))')
    THEN 'CHECK ((((currency)::text = ''USD''::text) AND ((kind)::text = ANY ((ARRAY[''STOCK''::character varying, ''ETF''::character varying])::text[]))))'
  WHEN t.relname = 'manual_assets' AND c.conname = 'manual_asset_rules' AND pg_get_constraintdef(c.oid) IN (
    'CHECK ((((currency)::text = ANY ((ARRAY[''THB''::character varying, ''USD''::character varying, ''USDT''::character varying])::text[])) AND ((type)::text = ANY ((ARRAY[''GOLD''::character varying, ''PROPERTY''::character varying, ''OTHER''::character varying])::text[])) AND (value >= (0)::numeric) AND ((cost IS NULL) OR (cost >= (0)::numeric)) AND ((quantity IS NULL) OR (quantity >= (0)::numeric)) AND (version > 0) AND (((currency)::text <> ''THB''::text) OR ((value = round(value, 2)) AND ((cost IS NULL) OR (cost = round(cost, 2)))))))',
    'CHECK ((((currency)::text = ANY (ARRAY[(''THB''::character varying)::text, (''USD''::character varying)::text, (''USDT''::character varying)::text])) AND ((type)::text = ANY (ARRAY[(''GOLD''::character varying)::text, (''PROPERTY''::character varying)::text, (''OTHER''::character varying)::text])) AND (value >= (0)::numeric) AND ((cost IS NULL) OR (cost >= (0)::numeric)) AND ((quantity IS NULL) OR (quantity >= (0)::numeric)) AND (version > 0) AND (((currency)::text <> ''THB''::text) OR ((value = round(value, 2)) AND ((cost IS NULL) OR (cost = round(cost, 2)))))))')
    THEN 'CHECK ((((currency)::text = ANY ((ARRAY[''THB''::character varying, ''USD''::character varying, ''USDT''::character varying])::text[])) AND ((type)::text = ANY ((ARRAY[''GOLD''::character varying, ''PROPERTY''::character varying, ''OTHER''::character varying])::text[])) AND (value >= (0)::numeric) AND ((cost IS NULL) OR (cost >= (0)::numeric)) AND ((quantity IS NULL) OR (quantity >= (0)::numeric)) AND (version > 0) AND (((currency)::text <> ''THB''::text) OR ((value = round(value, 2)) AND ((cost IS NULL) OR (cost = round(cost, 2)))))))'
  WHEN t.relname = 'media_attachments' AND c.conname = 'media_attachments_kind_check' AND pg_get_constraintdef(c.oid) IN (
    'CHECK (((kind)::text = ANY ((ARRAY[''finance''::character varying, ''crypto''::character varying, ''stock''::character varying])::text[])))',
    'CHECK (((kind)::text = ANY (ARRAY[(''finance''::character varying)::text, (''crypto''::character varying)::text, (''stock''::character varying)::text])))')
    THEN 'CHECK (((kind)::text = ANY ((ARRAY[''finance''::character varying, ''crypto''::character varying, ''stock''::character varying])::text[])))'
  WHEN t.relname = 'media_objects' AND c.conname = 'media_objects_purpose_check' AND pg_get_constraintdef(c.oid) IN (
    'CHECK (((purpose)::text = ANY ((ARRAY[''AVATAR''::character varying, ''RECEIPT''::character varying])::text[])))',
    'CHECK (((purpose)::text = ANY (ARRAY[(''AVATAR''::character varying)::text, (''RECEIPT''::character varying)::text])))')
    THEN 'CHECK (((purpose)::text = ANY ((ARRAY[''AVATAR''::character varying, ''RECEIPT''::character varying])::text[])))'
  WHEN t.relname = 'owner_profiles' AND c.conname = 'owner_profiles_preset_check' AND pg_get_constraintdef(c.oid) IN (
    'CHECK (((preset)::text = ANY ((ARRAY[''leaf''::character varying, ''moon''::character varying, ''book''::character varying])::text[])))',
    'CHECK (((preset)::text = ANY (ARRAY[(''leaf''::character varying)::text, (''moon''::character varying)::text, (''book''::character varying)::text])))')
    THEN 'CHECK (((preset)::text = ANY ((ARRAY[''leaf''::character varying, ''moon''::character varying, ''book''::character varying])::text[])))'
  ELSE pg_get_constraintdef(c.oid)
END, 'UTF8')), 'hex')
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
SELECT 'COLUMN:' || table_name || '.' || column_name, data_type, udt_name,
  is_nullable, character_maximum_length::text, numeric_precision::text, numeric_scale::text,
  datetime_precision::text, coalesce(column_default, '')
FROM information_schema.columns WHERE table_schema='public'
ORDER BY table_name COLLATE "C", column_name COLLATE "C";
COMMIT;
