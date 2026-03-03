/**
 * K6 SOAK TEST — 200 Tenant Multi-Tenant Yük Testi
 * ──────────────────────────────────────────────────────────────────────────────
 * Senaryo:
 *   • 200 sanal kullanıcı (VU), her biri farklı tenant token'ı kullanır
 *   • 15 dakika soak süresi (ramp-up 2dk → 11dk soak → ramp-down 2dk)
 *   • Key endpoint'leri rotate eder: appointments, entitlements, loyalty balance
 *
 * Threshold'lar:
 *   • http_req_duration p(95) < 200ms
 *   • http_req_failed rate < 0.5%
 *
 * Önkoşul:
 *   npx ts-node -r tsconfig-paths/register test/seed-200-tenants.ts
 *
 * Çalıştır:
 *   BASE_URL=http://localhost:4000 k6 run test/k6-soak.js
 * ──────────────────────────────────────────────────────────────────────────────
 */

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray }  from 'k6/data';
import { Trend, Counter, Rate } from 'k6/metrics';

// ── Custom metrics ────────────────────────────────────────────────────────────
const appointmentDuration  = new Trend('appointment_duration',  true);
const entitlementDuration  = new Trend('entitlement_duration',  true);
const loyaltyDuration      = new Trend('loyalty_duration',      true);
const fallbackHits         = new Counter('entitlement_fallback_hits');
const errorCounter         = new Counter('soak_errors');
const successRate          = new Rate('soak_success_rate');

// ── Test konfigürasyonu ───────────────────────────────────────────────────────
export const options = {
  /**
   * Staged ramp:
   *   0:00 →  2:00  — 0 → 200 VU  (warm-up)
   *   2:00 → 13:00  — 200 VU sabit (soak)
   *  13:00 → 15:00  — 200 → 0 VU  (ramp-down)
   */
  stages: [
    { duration: '2m',  target: 200 },
    { duration: '11m', target: 200 },
    { duration: '2m',  target: 0   },
  ],

  thresholds: {
    // Genel HTTP isteği p95 < 200ms
    'http_req_duration': ['p(95)<200'],

    // Hata oranı < %0.5
    'http_req_failed': ['rate<0.005'],

    // Endpoint bazlı p95 hedefleri
    'appointment_duration': ['p(95)<200'],
    'entitlement_duration': ['p(95)<150'],
    'loyalty_duration':     ['p(95)<200'],

    // Başarı oranı > %99.5
    'soak_success_rate': ['rate>0.995'],
  },

  // Özet çıktısını zenginleştir
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
};

// ── Tenant fixture'larını yükle (init context'te bir kez) ────────────────────
const tenants = new SharedArray('tenants', function () {
  // fixtures/tenants.json, seed-200-tenants.ts tarafından üretilir
  return JSON.parse(open('./fixtures/tenants.json'));
});

// ── Hedef URL ─────────────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const API      = `${BASE_URL}/api/v1`;

// ── Yardımcı: Tek VU için tenant seç (round-robin) ───────────────────────────
function pickTenant() {
  // __VU: 1-based VU index; tenants: 0-based array
  return tenants[(__VU - 1) % tenants.length];
}

// ── Ana test fonksiyonu (her VU her iteration çalışır) ───────────────────────
export default function soakIteration() {
  const tenant  = pickTenant();
  const headers = {
    'Authorization': `Bearer ${tenant.token}`,
    'Content-Type':  'application/json',
    'x-correlation-id': `soak-vu${__VU}-iter${__ITER}`,
  };

  // 1️⃣ Randevular listesi
  {
    const start = Date.now();
    const res = http.get(`${API}/appointments?limit=20`, { headers, tags: { endpoint: 'appointments' } });
    const dur = Date.now() - start;

    appointmentDuration.add(dur);

    const ok = check(res, {
      'appointments: 200': (r) => r.status === 200,
      'appointments: has body': (r) => r.body && r.body.length > 2,
    });

    successRate.add(ok);
    if (!ok) {
      errorCounter.add(1, { endpoint: 'appointments', status: String(res.status) });
    }
  }

  sleep(0.2);

  // 2️⃣ Entitlement kontrolü (plan özellikleri)
  {
    const start = Date.now();
    const res = http.get(`${API}/billing/entitlements`, { headers, tags: { endpoint: 'entitlements' } });
    const dur = Date.now() - start;

    entitlementDuration.add(dur);

    const ok = check(res, {
      'entitlements: 200': (r) => r.status === 200,
    });

    // Fallback header kontrolü (Redis yoksa DB fallback devreye girer)
    if (res.headers && res.headers['x-entitlement-source'] === 'db-fallback') {
      fallbackHits.add(1);
    }

    successRate.add(ok);
    if (!ok) {
      errorCounter.add(1, { endpoint: 'entitlements', status: String(res.status) });
    }
  }

  sleep(0.2);

  // 3️⃣ Loyalty bakiye sorgulama (plan'a göre çalışır/çalışmaz)
  {
    const start = Date.now();
    const res = http.get(`${API}/loyalty/balance`, { headers, tags: { endpoint: 'loyalty' } });
    const dur = Date.now() - start;

    loyaltyDuration.add(dur);

    // Loyalty sadece BOUTIQUE ve ENTERPRISE'da aktif;
    // SOLO planında 403 beklenir — her ikisi de kabul edilebilir
    const ok = check(res, {
      'loyalty: 200 or 403': (r) => r.status === 200 || r.status === 403,
    });

    successRate.add(ok);
    if (!ok) {
      errorCounter.add(1, { endpoint: 'loyalty', status: String(res.status) });
    }
  }

  sleep(0.2);

  // 4️⃣ Usage kullanım istatistikleri (admin değil — tenant kendi kullanımını görür)
  {
    const res = http.get(`${API}/billing/usage`, { headers, tags: { endpoint: 'usage' } });

    const ok = check(res, {
      'usage: 200 or 404': (r) => r.status === 200 || r.status === 404,
    });

    successRate.add(ok);
    if (!ok) {
      errorCounter.add(1, { endpoint: 'usage', status: String(res.status) });
    }
  }

  // Her iteration ~1s total think-time (0.2 * 3 sleep + 0.4 işlem)
  sleep(0.4);
}

// ── Test sonucu özeti ─────────────────────────────────────────────────────────
export function handleSummary(data) {
  const metrics = data.metrics;

  const p95    = metrics['http_req_duration']?.values?.['p(95)'] ?? 'N/A';
  const errRate = (metrics['http_req_failed']?.values?.rate ?? 0) * 100;
  const fallbacks = metrics['entitlement_fallback_hits']?.values?.count ?? 0;
  const total   = metrics['http_reqs']?.values?.count ?? 0;

  const summary = {
    timestamp:   new Date().toISOString(),
    totalRequests: total,
    p95_ms:      typeof p95 === 'number' ? Math.round(p95) : p95,
    errorRatePct: parseFloat(errRate.toFixed(3)),
    entitlementFallbacks: fallbacks,
    thresholdsPassed: data.metrics['http_req_duration']?.thresholds?.['p(95)<200']?.ok ?? false,
  };

  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║         SOAK TEST SONUÇLARI (15 Dakika)          ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Toplam istek        : ${String(summary.totalRequests).padEnd(26)}║`);
  console.log(`║  p95 yanıt süresi    : ${String(summary.p95_ms + ' ms').padEnd(26)}║`);
  console.log(`║  Hata oranı          : ${String(summary.errorRatePct + '%').padEnd(26)}║`);
  console.log(`║  Entitlement fallback: ${String(fallbacks).padEnd(26)}║`);
  console.log(`║  Threshold OK        : ${String(summary.thresholdsPassed).padEnd(26)}║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  return {
    'test/results/soak-summary.json': JSON.stringify(summary, null, 2),
    stdout: '\n',
  };
}
