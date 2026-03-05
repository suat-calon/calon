-- Docker ilk başlatmada çalışır.
-- calon_app rolünü superuser olmadan oluşturur.
-- Şifre production'da Vault/Secret Manager'dan gelecek.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'calon_app') THEN
    CREATE ROLE calon_app LOGIN PASSWORD 'calon_app_dev_secret';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE calon_dev TO calon_app;
