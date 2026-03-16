# Minimum Observability — Calon OS

> Bir hata olduğunda 5 dakika içinde tespit edilebilsin.

---

## Endpoint'ler

### GET /api/v1/health
Basit liveness probe. Docker healthcheck ve uptime monitor'lar için.

```bash
curl http://141.144.243.114/api/v1/health
# → {"status":"ok","service":"calon-api","timestamp":"..."}
```

### GET /api/v1/health/ready
DB + Redis sağlık kontrolü. Deployment pipeline ve readiness probe için.

- **200** → tümü up (`status: "ready"`)
- **503** → herhangi biri down (`status: "degraded"`)

```bash
curl http://141.144.243.114/api/v1/health/ready
# → {
#     "status": "ready",
#     "checks": {
#       "database": { "status": "up", "latencyMs": 4 },
#       "redis":    { "status": "up", "latencyMs": 1 }
#     },
#     "timestamp": "2026-03-16T..."
#   }
```

### GET /api/v1/health/version
Hangi commit ve build'in canlıda olduğunu gösterir.

```bash
curl http://141.144.243.114/api/v1/health/version
# → {
#     "version":     "1.0.0",
#     "commit":      "abc1234",
#     "buildTime":   "2026-03-16T10:00:00Z",
#     "nodeVersion": "v20.x.x",
#     "environment": "production"
#   }
```

`commit` ve `buildTime` değerleri Docker build sırasında enjekte edilir:
```bash
docker build \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t calon-api .
```

---

## Request Tracing (MEVCUT — CorrelationMiddleware)

Her HTTP isteğine otomatik olarak `correlationId` atanır.

- **Header önceliği:** `x-request-id` → `x-correlation-id` → `crypto.randomUUID()`
- **Response header:** `x-request-id` ve `x-correlation-id` her yanıtta döner
- **Log entegrasyonu:** Pino mixin ile `correlationId` her log satırında mevcut

```bash
# İstek izleme örneği
curl -H "x-request-id: my-trace-123" http://141.144.243.114/api/v1/health
# Response header: x-request-id: my-trace-123

# Log'da görünüm:
# {"correlationId":"my-trace-123","method":"GET","path":"/api/v1/health","statusCode":200,...}
```

---

## Worker Events (MEVCUT — @OnQueueFailed)

BullMQ processor'lar başarısız job'ları otomatik olarak loglar.

### Başarısız Job (ERROR level)
```
[Dispatcher] Job başarısız: jobId=123 attempt=3/3 err=PARTITION_LOCKED:...
[SmsWorker]  Job başarısız: jobId=456 attempt=3/3 err=PROVIDER_TIMEOUT
```

### Max Attempts → DLQ
- `FailedJobService` → PostgreSQL'e kaydedilir (`failed_jobs` tablosu)
- `dlq` kuyruğuna taşınır

### Log seviyeleri
| Durum | Level |
|-------|-------|
| Job başarılı | INFO |
| Geçici hata / retry | WARN |
| Max attempts / DLQ | WARN + FailedJobService |
| Worker crash | ERROR (GlobalErrorFilter) |

---

## Production Kontrol Komutları

```bash
# Liveness
curl http://141.144.243.114/api/v1/health

# Readiness (DB + Redis)
curl http://141.144.243.114/api/v1/health/ready

# Hangi build canlıda
curl http://141.144.243.114/api/v1/health/version

# Son 50 API log
docker logs calon-api --tail 50

# Son 50 Worker log
docker logs calon-worker --tail 50

# Container durumu
docker ps

# API log stream
docker logs calon-api -f

# Worker log stream
docker logs calon-worker -f
```

---

## Structured Log Format (Pino JSON)

Production'da her log satırı JSON:

```json
{
  "level": "info",
  "time": 1710000000000,
  "correlationId": "uuid-here",
  "context": "LoggingInterceptor",
  "method": "POST",
  "path": "/api/v1/public/salon/demo/book",
  "statusCode": 201,
  "durationMs": 45
}
```

Hata log'ları `error` level ve `err.message` içerir.

---

## Alarm Eşikleri (Manuel)

| Durum | Aksiyon |
|-------|---------|
| `/health/ready` → 503 | Acil müdahale — DB veya Redis down |
| `docker ps` → container missing | Container restart |
| Worker log'da `[DLQ]` artar | FailedJobService'i kontrol et |
| `/health/ready` latencyMs > 1000 | DB yavaşlama araştır |
