-- Faz 21.5: DB Hardening — Extension + Ownership Migration
-- =============================================================================
-- 1. btree_gist extension — GIST kalkanı için zorunlu
--    (Shadow DB'de eksik olduğu için migrate dev başarısız oluyordu)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================================================
-- 2. Tablo sahipliği: postgres → calon_app
--    Tüm public schema tabloları calon_app rolüne transfer edilir.
--    Bu sayede calon_app, migrate deploy sırasında ALTER TABLE çalıştırabilir.
-- =============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
  LOOP
    EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO calon_app';
  END LOOP;
END $$;

-- =============================================================================
-- 3. Sequence sahipliği: postgres → calon_app
-- =============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT sequence_name
    FROM   information_schema.sequences
    WHERE  sequence_schema = 'public'
  LOOP
    EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO calon_app';
  END LOOP;
END $$;
