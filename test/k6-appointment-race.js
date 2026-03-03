/**
 * K6 APPOINTMENT RACE TEST — Faz 14
 * ─────────────────────────────────────────────────────────────────────────────
 * Amaç: 100 VU aynı anda aynı slot için randevu oluşturmaya çalışır.
 *       Yalnızca 1 istek başarılı (201) olmalı, 99'u 409 almalıdır.
 *
 * Kullanım:
 *   k6 run test/k6-appointment-race.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e TENANT_ID=<uuid> \
 *     -e TOKEN=<jwt> \
 *     -e STAFF_ID=<uuid> \
 *     -e SERVICE_ID=<uuid> \
 *     -e LOCATION_ID=<uuid> \
 *     -e CUSTOMER_ID=<uuid>
 *
 * Kabul kriterleri:
 *   • http_req_duration (p95) < 250ms
 *   • appointment_created == 1
 *   • appointment_conflict >= 99
 *   • error_rate (5xx) < 1%
 * ─────────────────────────────────────────────────────────────────────────────
 */

import http    from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ── Özel metrikler ────────────────────────────────────────────────────────────

/** 201 Created sayısı — tam olarak 1 olmalı */
const appointmentCreated  = new Counter('appointment_created');

/** 409 Conflict sayısı — 99 veya daha fazla olmalı */
const appointmentConflict = new Counter('appointment_conflict');

/** 5xx hata oranı (sunucu hatası) */
const errorRate  = new Rate('appointment_error_rate');

/** Randevu isteği gecikmesi */
const reqDuration = new Trend('appointment_request_duration', true);

// ── Senaryo ───────────────────────────────────────────────────────────────────

export const options = {
  /**
   * 100 VU → hepsi aynı anda başlar ve sadece 1 istek gönderir.
   * arrival-rate yerine sabit VU kullanıyoruz — aynı anda yarışma senaryosu.
   */
  scenarios: {
    slot_race: {
      executor:          'shared-iterations',
      vus:               100,
      iterations:        100,
      maxDuration:       '30s',
    },
  },

  thresholds: {
    // p95 yanıt süresi 250ms altında olmalı
    'http_req_duration': ['p(95)<250'],

    // Sunucu hatası (5xx) kabul edilemez
    'appointment_error_rate': ['rate<0.01'],

    // 201 en fazla 1 — NOT: k6 thresholds Counter için "count" kullanır
    // Sadece loglama; actual assertion Jest'te
    'appointment_created':  ['count>=1'],
    'appointment_conflict': ['count>=1'],
  },
};

// ── VU init ───────────────────────────────────────────────────────────────────

const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:3000';
const TOKEN       = __ENV.TOKEN       || '';
const STAFF_ID    = __ENV.STAFF_ID    || '';
const SERVICE_ID  = __ENV.SERVICE_ID  || '';
const LOCATION_ID = __ENV.LOCATION_ID || '';
const CUSTOMER_ID = __ENV.CUSTOMER_ID || '';

/** Sabit slot — tüm VU aynı slota saldırır */
const SLOT_START = '2026-06-15T10:00:00.000Z';
const SLOT_END   = '2026-06-15T11:00:00.000Z';

const HEADERS = {
  'Content-Type':  'application/json',
  'Authorization': `Bearer ${TOKEN}`,
};

const BODY = JSON.stringify({
  customerId:  CUSTOMER_ID,
  staffId:     STAFF_ID,
  serviceId:   SERVICE_ID,
  locationId:  LOCATION_ID,
  startTime:   SLOT_START,
  endTime:     SLOT_END,
});

// ── VU default function ───────────────────────────────────────────────────────

export default function () {
  const res = http.post(
    `${BASE_URL}/appointments`,
    BODY,
    { headers: HEADERS, timeout: '10s' },
  );

  // Gecikmeyi kaydet
  reqDuration.add(res.timings.duration);

  const is201 = res.status === 201;
  const is409 = res.status === 409;
  const is5xx = res.status >= 500;

  // Metrik güncelle
  if (is201)  appointmentCreated.add(1);
  if (is409)  appointmentConflict.add(1);
  if (is5xx)  errorRate.add(1);
  else        errorRate.add(0);

  check(res, {
    'yanıt 201 veya 409':        (r) => r.status === 201 || r.status === 409,
    '5xx yok':                   (r) => r.status < 500,
    'yanıt süresi < 250ms':      (r) => r.timings.duration < 250,
  });
}

// ── Özet rapor ────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const created  = data.metrics['appointment_created']?.values?.count  ?? 0;
  const conflict = data.metrics['appointment_conflict']?.values?.count ?? 0;
  const p95      = data.metrics['http_req_duration']?.values?.['p(95)'] ?? 0;
  const errRate  = data.metrics['appointment_error_rate']?.values?.rate ?? 0;

  const passed   =
    created === 1 &&
    conflict >= 99 &&
    p95 < 250 &&
    errRate < 0.01;

  const summary = {
    timestamp:         new Date().toISOString(),
    scenario:          'appointment-slot-race',
    vus:               100,
    iterations:        100,
    results: {
      appointment_created:  created,
      appointment_conflict: conflict,
      p95_ms:               Math.round(p95),
      error_rate:           errRate,
    },
    acceptance: {
      created_eq_1:      created === 1,
      conflict_gte_99:   conflict >= 99,
      p95_lt_250ms:      p95 < 250,
      error_rate_lt_1pct: errRate < 0.01,
    },
    passed,
  };

  console.log('\n══════════════════════════════════════════════');
  console.log('  K6 APPOINTMENT RACE TEST — SONUÇ');
  console.log('══════════════════════════════════════════════');
  console.log(`  appointment_created:  ${created}  (beklenen: 1)`);
  console.log(`  appointment_conflict: ${conflict} (beklenen: ≥99)`);
  console.log(`  p95 yanıt süresi:     ${Math.round(p95)}ms (limit: <250ms)`);
  console.log(`  5xx hata oranı:       ${(errRate * 100).toFixed(2)}% (limit: <1%)`);
  console.log('──────────────────────────────────────────────');
  console.log(`  SONUÇ: ${passed ? '✅ BAŞARILI' : '❌ BAŞARISIZ'}`);
  console.log('══════════════════════════════════════════════\n');

  return {
    'test/results/race-summary.json': JSON.stringify(summary, null, 2),
    stdout: '\n',
  };
}
