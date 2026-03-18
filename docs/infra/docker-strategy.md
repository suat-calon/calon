# Docker Strategy — Calon OS

**Son guncelleme:** 2026-03-18 (P7)

---

## Image Yapisi

| Ozellik | Deger |
|---------|-------|
| Base image | `node:20-alpine3.19` (pinlenmis) |
| Build stratejisi | Multi-stage: builder (full deps) → runner (prod deps) |
| Non-root user | `calon` |
| Prisma client | `linux-musl-openssl-3.0.x` (Alpine uyumlu) |
| Runtime path resolver | `tsconfig-paths/register` |

## Entrypoint'ler

Ayni image, farkli CMD:

| Servis | CMD | Aciklama |
|--------|-----|----------|
| API | `node dist/main.js` | HTTP server, port 4000 |
| Worker | `node dist/worker.js` | BullMQ processor, HTTP server YOK |

## Dosya Yapisi

```
apps/api/Dockerfile              → Tek Dockerfile (API + Worker)
docker-compose.yml               → Local dev stack (Postgres + Redis + API + Worker)
docker-compose.production.yml    → Production override (external DB/Redis)
docker/postgres-init.sql         → calon_app role olusturma (local dev)
```

## Local Development

```bash
docker-compose up -d
# Postgres (5432) + Redis (6379) + API (4000) + Worker
```

## Production Deployment (Oracle Cloud) 

```bash
docker-compose -f docker-compose.yml \
  -f docker-compose.production.yml up -d
```

Production override:
- Postgres ve Redis servisleri **devre disi** (Neon + Cloud Redis kullanilir)
- API: 512MB memory limit, json-file logging
- Worker: 256MB memory limit, json-file logging
- `depends_on` kaldirilir (external bagimliliklara bagimli degil)

## Healthcheck

| Servis | Yontem | Endpoint | Aralik |
|--------|--------|----------|--------|
| API | wget | `http://localhost:4000/api/v1/health` | 10s |
| Worker | pgrep | `pgrep -f 'node dist/worker'` | 30s |
| Postgres | pg_isready | — | 5s |
| Redis | redis-cli ping | — | 5s |

## Kirmizi Cizgiler

```
❌ Production compose'a Postgres veya Redis servisi ekleme YASAK
❌ API ve Worker farkli image versiyonu YASAK
❌ Production'da db push YASAK
❌ Container icinde migration calistirma YASAK (entrypoint'te yok)
❌ Root kullanici ile container calistirma YASAK
```

## ENV Yonetimi

Tum env var'lari `docker-compose.yml`'de `${VAR:-default}` syntax'i ile tanimli.
Production'da `.env` dosyasi veya orchestrator secret'lari uzerinden inject edilir.
Tam env listesi: `docs/infra/env-contract.md`
