-- Docker ilk başlatmada çalışır.
-- auralis_app rolünü superuser olmadan oluşturur.
-- Şifre production'da Vault/Secret Manager'dan gelecek.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'auralis_app') THEN
    CREATE ROLE auralis_app LOGIN PASSWORD 'auralis_app_dev_secret';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE auralis_dev TO auralis_app;
