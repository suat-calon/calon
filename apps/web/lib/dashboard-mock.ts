/**
 * Dashboard data model + operations engine mock data
 * UI-08/08.1: Dashboard + hardening
 * UI-09: Operations engine — appointment ops, staff ops, daily workflow
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface TodayStats {
  totalAppointments: number;
  completedAppointments: number;
  occupancyPercent: number;
  estimatedRevenue: number;
  pendingCount: number;
  cancelledCount: number;
  noShowCount: number;
  currency: string;
}

export interface DashboardAlert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  message: string;
  action?: { label: string; href: string };
}

export type ActionType =
  | 'pending_approval'
  | 'upcoming_soon'
  | 'payment_due'
  | 'empty_slot'
  | 'cancelled_recovery';

export interface DashboardAction {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  cta: { label: string; href: string };
  urgency: 'high' | 'medium' | 'low';
  timestamp?: string;
}

export interface LiveAppointment {
  id: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  price: number;
  currency: string;
}

export interface RevenuePulse {
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  currency: string;
  dailyTrend: number[];
}

export interface CustomerInsight {
  newThisWeek: number;
  returningThisWeek: number;
  lostThisMonth: number;
  totalActive: number;
}

// ── UI-09: Operations Engine Types ────────────────────────────────────────────

/** Extended appointment for operations — includes phone, notes, detail fields */
export interface AppointmentOp {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  staffName: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  price: number;
  currency: string;
  note?: string;
  /** Is the customer late? (start time passed, not checked in) */
  isDelayed: boolean;
  /** Computed priority: 1=problem, 2=upcoming, 3=active, 4=done */
  priority: 1 | 2 | 3 | 4;
}

/** Valid status transitions — what actions are allowed from each status */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING:    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:  ['CHECKED_IN', 'NO_SHOW', 'CANCELLED'],
  CHECKED_IN: ['IN_SERVICE', 'NO_SHOW', 'CANCELLED'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED:  [],
  CANCELLED:  [],
  NO_SHOW:    [],
};

/** Action labels for status transitions — verb-first CTAs */
export const STATUS_ACTION_LABELS: Record<AppointmentStatus, string> = {
  PENDING:    'Bekliyor',
  CONFIRMED:  'Randevuyu onayla',
  CHECKED_IN: 'Geldi olarak işaretle',
  IN_SERVICE: 'Hizmete başla',
  COMPLETED:  'Tamamlandı işaretle',
  CANCELLED:  'Randevuyu iptal et',
  NO_SHOW:    'Gelmedi işaretle',
};

/** Tooltip/helper text for disabled actions */
export const STATUS_DISABLED_REASONS: Partial<Record<AppointmentStatus, string>> = {
  COMPLETED:  'Randevu zaten tamamlandı',
  IN_SERVICE: 'Randevu saati henüz gelmedi',
};

export interface StaffOp {
  id: string;
  name: string;
  role: string;
  todayAppointments: number;
  completedAppointments: number;
  currentStatus: 'busy' | 'available' | 'break' | 'off';
  emptySlots: number;
  noShowCount: number;
  /** Current customer being served (if busy) */
  currentCustomer?: string;
  /** Next appointment time */
  nextAppointmentTime?: string;
}

export interface EmptySlotOp {
  id: string;
  startTime: string;
  endTime: string;
  staffName: string;
  reason: 'no_booking' | 'cancellation' | 'no_show';
  /** If from cancellation, who cancelled */
  cancelledBy?: string;
}

export interface OperationsStrip {
  activeNow: number;
  upcoming30min: number;
  delayed: number;
  noShows: number;
  emptyWindows: number;
  /** Narrative descriptions */
  narratives: string[];
}

// ── UI-10: Revenue Ops + Service Catalog + Staff Management Types ────────────

export interface RevenueStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  avgAppointmentValue: number;
  topServiceName: string;
  topServiceRevenue: number;
  topServicePct: number;
  currency: string;
  dailyTrend: number[];
}

export interface ServiceStat {
  id: string;
  name: string;
  appointmentCount: number;
  totalRevenue: number;
  avgDuration: number;
  occupancyPct: number;
  price: number;
  isActive: boolean;
  currency: string;
}

export interface StaffStat {
  id: string;
  name: string;
  role: string;
  todayAppointments: number;
  completedAppointments: number;
  noShowCount: number;
  avgServiceDuration: number;
  estimatedRevenue: number;
  availability: 'available' | 'busy' | 'off';
  currency: string;
}

export interface HourSlot {
  hour: number;
  occupancy: number;
  appointments: number;
}

export interface CapacityStats {
  overallOccupancy: number;
  hourSlots: HourSlot[];
  busiestHours: string[];
  emptiestHours: string[];
}

// ── UI-12: Growth + Retention Engine Types ───────────────────────────────────

export type CustomerSegmentType =
  | 'new'
  | 'returning'
  | 'dormant'
  | 'no_show_risk'
  | 'loyal'
  | 'one_time';

export interface RetentionStats {
  returningThisWeek: number;
  newThisWeek: number;
  atRiskCount: number;
  oneTimeRate: number; // 0–100
  retentionRate: number; // 0–100
  avgVisitFrequencyDays: number;
}

export interface CustomerSegment {
  id: string;
  type: CustomerSegmentType;
  label: string;
  count: number;
  description: string;
  cta: { label: string; href: string };
}

export interface RebookOpportunity {
  id: string;
  customerName: string;
  lastVisitDaysAgo: number;
  lastService: string;
  reason: 'periodic' | 'dormant' | 'no_show_lost' | 'one_time';
  suggestedAction: string;
  cta: { label: string; href: string };
}

export interface NoShowRecovery {
  id: string;
  customerName: string;
  noShowDate: string;
  serviceName: string;
  hasRebooked: boolean;
  daysSinceNoShow: number;
}

export interface LifecycleHint {
  id: string;
  customerName: string;
  message: string;
  type: 'dormant' | 'one_time' | 'loyal_upsell' | 'birthday';
}

// ── Dashboard Data (combined) ─────────────────────────────────────────────────

export interface DashboardData {
  salonName: string;
  todayStats: TodayStats;
  alerts: DashboardAlert[];
  actions: DashboardAction[];
  liveAppointments: LiveAppointment[];
  revenue: RevenuePulse | null;
  customers: CustomerInsight | null;
  // UI-09 additions
  appointmentOps: AppointmentOp[];
  staffOps: StaffOp[];
  emptySlotOps: EmptySlotOp[];
  operationsStrip: OperationsStrip;
  // UI-10 additions
  revenueStats: RevenueStats | null;
  serviceStats: ServiceStat[];
  staffStats: StaffStat[];
  capacityStats: CapacityStats | null;
  // UI-12 additions
  retentionStats: RetentionStats | null;
  customerSegments: CustomerSegment[];
  rebookOpportunities: RebookOpportunity[];
  noShowRecoveries: NoShowRecovery[];
  lifecycleHints: LifecycleHint[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayAt(hours: number, minutes = 0): string {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function minutesFromNow(mins: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

// ── Default / Fallback data ───────────────────────────────────────────────────

export const EMPTY_STATS: TodayStats = {
  totalAppointments: 0, completedAppointments: 0, occupancyPercent: 0,
  estimatedRevenue: 0, pendingCount: 0, cancelledCount: 0, noShowCount: 0, currency: 'TRY',
};

export const EMPTY_REVENUE: RevenuePulse = {
  today: 0, yesterday: 0, thisWeek: 0, lastWeek: 0, currency: 'TRY', dailyTrend: [],
};

export const EMPTY_CUSTOMERS: CustomerInsight = {
  newThisWeek: 0, returningThisWeek: 0, lostThisMonth: 0, totalActive: 0,
};

export const EMPTY_OPS_STRIP: OperationsStrip = {
  activeNow: 0, upcoming30min: 0, delayed: 0, noShows: 0, emptyWindows: 0,
  narratives: ['Bugün operasyon gerektiren ekstra durum yok'],
};

// ── Mock Data — Realistic scenario ────────────────────────────────────────────

export const MOCK_DASHBOARD: DashboardData = {
  salonName: 'Studio Bella',

  todayStats: {
    totalAppointments: 14, completedAppointments: 6, occupancyPercent: 72,
    estimatedRevenue: 4_850, pendingCount: 2, cancelledCount: 1, noShowCount: 1, currency: 'TRY',
  },

  alerts: [
    { id: 'alert-1', type: 'warning', message: '14:00–16:00 arası boş slot var — doluluk %72', action: { label: 'Kampanya oluştur', href: '/campaigns/new' } },
    { id: 'alert-2', type: 'danger', message: 'Bugün 1 no-show kaydedildi (Mehmet Kara, 10:00)' },
  ],

  actions: [
    { id: 'act-1', type: 'pending_approval', title: 'Onay bekleyen randevu', description: 'Zeynep Aksoy — Saç Boyama, 15:30', cta: { label: 'Randevuyu onayla', href: '/appointments/act-1/approve' }, urgency: 'high', timestamp: todayAt(15, 30) },
    { id: 'act-2', type: 'pending_approval', title: 'Onay bekleyen randevu', description: 'Derya Yılmaz — Manikür, 16:00', cta: { label: 'Randevuyu onayla', href: '/appointments/act-2/approve' }, urgency: 'high', timestamp: todayAt(16, 0) },
    { id: 'act-3', type: 'upcoming_soon', title: '15 dk içinde randevu', description: 'Elif Demir — Fön + Bakım, 11:30', cta: { label: 'Randevuyu hazırla', href: '/appointments/act-3' }, urgency: 'high', timestamp: minutesFromNow(15) },
    { id: 'act-4', type: 'empty_slot', title: 'Boş slot uyarısı', description: '14:00–15:00 arası hiç randevu yok', cta: { label: 'Takvimde göster', href: '/calendar' }, urgency: 'medium' },
    { id: 'act-5', type: 'cancelled_recovery', title: 'İptal edilen müşteri', description: 'Mehmet Kara bugünkü randevusunu iptal etti', cta: { label: 'Müşteriyi ara', href: '/customers/mehmet-kara' }, urgency: 'low' },
  ],

  liveAppointments: [
    { id: 'la-1', customerName: 'Ayşe Korkmaz', serviceName: 'Saç Kesimi + Fön', staffName: 'Selin T.', startTime: todayAt(9, 0), endTime: todayAt(9, 45), status: 'COMPLETED', price: 350, currency: 'TRY' },
    { id: 'la-2', customerName: 'Fatma Çelik', serviceName: 'Keratin Bakım', staffName: 'Büşra A.', startTime: todayAt(9, 30), endTime: todayAt(10, 30), status: 'COMPLETED', price: 650, currency: 'TRY' },
    { id: 'la-3', customerName: 'Mehmet Kara', serviceName: 'Saç Kesimi', staffName: 'Selin T.', startTime: todayAt(10, 0), endTime: todayAt(10, 30), status: 'NO_SHOW', price: 200, currency: 'TRY' },
    { id: 'la-4', customerName: 'Deniz Öztürk', serviceName: 'Ombre', staffName: 'Büşra A.', startTime: todayAt(10, 30), endTime: todayAt(12, 0), status: 'IN_SERVICE', price: 900, currency: 'TRY' },
    { id: 'la-5', customerName: 'Canan Yıldız', serviceName: 'Manikür + Pedikür', staffName: 'Gamze D.', startTime: todayAt(11, 0), endTime: todayAt(12, 0), status: 'CHECKED_IN', price: 400, currency: 'TRY' },
    { id: 'la-6', customerName: 'Elif Demir', serviceName: 'Fön + Bakım', staffName: 'Selin T.', startTime: todayAt(11, 30), endTime: todayAt(12, 15), status: 'CONFIRMED', price: 300, currency: 'TRY' },
    { id: 'la-7', customerName: 'Zeynep Aksoy', serviceName: 'Saç Boyama', staffName: 'Büşra A.', startTime: todayAt(15, 30), endTime: todayAt(17, 0), status: 'PENDING', price: 750, currency: 'TRY' },
    { id: 'la-8', customerName: 'Derya Yılmaz', serviceName: 'Manikür', staffName: 'Gamze D.', startTime: todayAt(16, 0), endTime: todayAt(16, 45), status: 'PENDING', price: 250, currency: 'TRY' },
  ],

  revenue: {
    today: 4_850, yesterday: 3_900, thisWeek: 22_400, lastWeek: 19_800,
    currency: 'TRY', dailyTrend: [3_200, 4_100, 3_800, 3_900, 4_500, 2_900, 4_850],
  },

  customers: { newThisWeek: 5, returningThisWeek: 18, lostThisMonth: 3, totalActive: 142 },

  // ── UI-09: Operations Data ──────────────────────────────────────────────────

  appointmentOps: [
    // Priority 1: Problem — no-show, delayed
    { id: 'op-1', customerName: 'Mehmet Kara', customerPhone: '0532 111 2233', serviceName: 'Saç Kesimi', staffName: 'Selin T.', startTime: todayAt(10, 0), endTime: todayAt(10, 30), status: 'NO_SHOW', price: 200, currency: 'TRY', isDelayed: false, priority: 1 },
    { id: 'op-2', customerName: 'Burcu Arslan', customerPhone: '0535 444 5566', serviceName: 'Cilt Bakımı', staffName: 'Gamze D.', startTime: todayAt(10, 45), endTime: todayAt(11, 30), status: 'CONFIRMED', price: 500, currency: 'TRY', isDelayed: true, priority: 1, note: 'İlk seans müşterisi' },
    // Priority 2: Upcoming
    { id: 'op-3', customerName: 'Elif Demir', customerPhone: '0544 222 3344', serviceName: 'Fön + Bakım', staffName: 'Selin T.', startTime: todayAt(11, 30), endTime: todayAt(12, 15), status: 'CONFIRMED', price: 300, currency: 'TRY', isDelayed: false, priority: 2 },
    // Priority 3: Active (in service / checked in)
    { id: 'op-4', customerName: 'Deniz Öztürk', customerPhone: '0541 333 4455', serviceName: 'Ombre', staffName: 'Büşra A.', startTime: todayAt(10, 30), endTime: todayAt(12, 0), status: 'IN_SERVICE', price: 900, currency: 'TRY', isDelayed: false, priority: 3 },
    { id: 'op-5', customerName: 'Canan Yıldız', customerPhone: '0533 555 6677', serviceName: 'Manikür + Pedikür', staffName: 'Gamze D.', startTime: todayAt(11, 0), endTime: todayAt(12, 0), status: 'CHECKED_IN', price: 400, currency: 'TRY', isDelayed: false, priority: 3 },
    // Priority 2: Upcoming (further out)
    { id: 'op-6', customerName: 'Zeynep Aksoy', customerPhone: '0537 666 7788', serviceName: 'Saç Boyama', staffName: 'Büşra A.', startTime: todayAt(15, 30), endTime: todayAt(17, 0), status: 'PENDING', price: 750, currency: 'TRY', isDelayed: false, priority: 2, note: 'Açık ton istiyor, önceki fotoğrafı var' },
    { id: 'op-7', customerName: 'Derya Yılmaz', customerPhone: '0539 777 8899', serviceName: 'Manikür', staffName: 'Gamze D.', startTime: todayAt(16, 0), endTime: todayAt(16, 45), status: 'PENDING', price: 250, currency: 'TRY', isDelayed: false, priority: 2 },
    // Priority 4: Done
    { id: 'op-8', customerName: 'Ayşe Korkmaz', customerPhone: '0531 888 9900', serviceName: 'Saç Kesimi + Fön', staffName: 'Selin T.', startTime: todayAt(9, 0), endTime: todayAt(9, 45), status: 'COMPLETED', price: 350, currency: 'TRY', isDelayed: false, priority: 4 },
    { id: 'op-9', customerName: 'Fatma Çelik', customerPhone: '0536 999 0011', serviceName: 'Keratin Bakım', staffName: 'Büşra A.', startTime: todayAt(9, 30), endTime: todayAt(10, 30), status: 'COMPLETED', price: 650, currency: 'TRY', isDelayed: false, priority: 4 },
  ],

  staffOps: [
    { id: 'staff-1', name: 'Selin T.', role: 'Kuaför', todayAppointments: 5, completedAppointments: 2, currentStatus: 'available', emptySlots: 2, noShowCount: 0, nextAppointmentTime: todayAt(11, 30) },
    { id: 'staff-2', name: 'Büşra A.', role: 'Kuaför', todayAppointments: 4, completedAppointments: 1, currentStatus: 'busy', emptySlots: 1, noShowCount: 0, currentCustomer: 'Deniz Öztürk' },
    { id: 'staff-3', name: 'Gamze D.', role: 'Manikür Uzmanı', todayAppointments: 3, completedAppointments: 0, currentStatus: 'available', emptySlots: 3, noShowCount: 0, nextAppointmentTime: todayAt(11, 0) },
  ],

  emptySlotOps: [
    { id: 'es-1', startTime: todayAt(10, 0), endTime: todayAt(10, 30), staffName: 'Selin T.', reason: 'no_show', cancelledBy: 'Mehmet Kara' },
    { id: 'es-2', startTime: todayAt(14, 0), endTime: todayAt(15, 0), staffName: 'Selin T.', reason: 'no_booking' },
    { id: 'es-3', startTime: todayAt(13, 0), endTime: todayAt(15, 30), staffName: 'Büşra A.', reason: 'no_booking' },
    { id: 'es-4', startTime: todayAt(12, 0), endTime: todayAt(16, 0), staffName: 'Gamze D.', reason: 'no_booking' },
  ],

  operationsStrip: {
    activeNow: 2,
    upcoming30min: 1,
    delayed: 1,
    noShows: 1,
    emptyWindows: 4,
    narratives: [
      'Şu anda 2 aktif işlem var',
      '30 dakika içinde 1 müşteri daha gelecek',
      '1 müşteri gecikti — Burcu Arslan, 10:45 randevusu',
      '1 müşteri gelmedi — Mehmet Kara, 10:00',
    ],
  },

  // ── UI-10: Revenue Ops + Service + Staff + Capacity ─────────────────────────

  revenueStats: {
    today: 4_850,
    yesterday: 3_900,
    thisWeek: 22_400,
    lastWeek: 19_800,
    avgAppointmentValue: 485,
    topServiceName: 'Saç Boyama',
    topServiceRevenue: 8_400,
    topServicePct: 38,
    currency: 'TRY',
    dailyTrend: [3_200, 4_100, 3_800, 3_900, 4_500, 2_900, 4_850],
  },

  serviceStats: [
    { id: 'svc-1', name: 'Saç Boyama', appointmentCount: 12, totalRevenue: 8_400, avgDuration: 90, occupancyPct: 85, price: 750, isActive: true, currency: 'TRY' },
    { id: 'svc-2', name: 'Saç Kesimi + Fön', appointmentCount: 18, totalRevenue: 6_300, avgDuration: 45, occupancyPct: 78, price: 350, isActive: true, currency: 'TRY' },
    { id: 'svc-3', name: 'Keratin Bakım', appointmentCount: 8, totalRevenue: 5_200, avgDuration: 60, occupancyPct: 65, price: 650, isActive: true, currency: 'TRY' },
    { id: 'svc-4', name: 'Manikür + Pedikür', appointmentCount: 14, totalRevenue: 4_200, avgDuration: 60, occupancyPct: 72, price: 400, isActive: true, currency: 'TRY' },
    { id: 'svc-5', name: 'Ombre', appointmentCount: 5, totalRevenue: 4_500, avgDuration: 120, occupancyPct: 55, price: 900, isActive: true, currency: 'TRY' },
    { id: 'svc-6', name: 'Fön + Bakım', appointmentCount: 10, totalRevenue: 3_000, avgDuration: 40, occupancyPct: 60, price: 300, isActive: true, currency: 'TRY' },
    { id: 'svc-7', name: 'Cilt Bakımı', appointmentCount: 6, totalRevenue: 3_000, avgDuration: 45, occupancyPct: 50, price: 500, isActive: true, currency: 'TRY' },
    { id: 'svc-8', name: 'Sakal Düzeltme', appointmentCount: 3, totalRevenue: 450, avgDuration: 20, occupancyPct: 15, price: 150, isActive: false, currency: 'TRY' },
  ],

  staffStats: [
    { id: 'ss-1', name: 'Selin T.', role: 'Kuaför', todayAppointments: 5, completedAppointments: 2, noShowCount: 0, avgServiceDuration: 48, estimatedRevenue: 1_850, availability: 'available', currency: 'TRY' },
    { id: 'ss-2', name: 'Büşra A.', role: 'Kuaför', todayAppointments: 4, completedAppointments: 1, noShowCount: 0, avgServiceDuration: 72, estimatedRevenue: 2_300, availability: 'busy', currency: 'TRY' },
    { id: 'ss-3', name: 'Gamze D.', role: 'Manikür Uzmanı', todayAppointments: 3, completedAppointments: 0, noShowCount: 1, avgServiceDuration: 55, estimatedRevenue: 700, availability: 'available', currency: 'TRY' },
  ],

  capacityStats: {
    overallOccupancy: 72,
    hourSlots: [
      { hour: 9, occupancy: 100, appointments: 3 },
      { hour: 10, occupancy: 80, appointments: 2 },
      { hour: 11, occupancy: 60, appointments: 2 },
      { hour: 12, occupancy: 30, appointments: 1 },
      { hour: 13, occupancy: 0, appointments: 0 },
      { hour: 14, occupancy: 0, appointments: 0 },
      { hour: 15, occupancy: 50, appointments: 1 },
      { hour: 16, occupancy: 50, appointments: 1 },
      { hour: 17, occupancy: 80, appointments: 2 },
      { hour: 18, occupancy: 60, appointments: 1 },
    ],
    busiestHours: ['09:00', '10:00', '17:00'],
    emptiestHours: ['13:00', '14:00'],
  },

  // ── UI-12: Growth + Retention Engine ───────────────────────────────────────

  retentionStats: {
    returningThisWeek: 18,
    newThisWeek: 5,
    atRiskCount: 8,
    oneTimeRate: 22,
    retentionRate: 78,
    avgVisitFrequencyDays: 28,
  },

  customerSegments: [
    { id: 'seg-new', type: 'new', label: 'Yeni Müşteriler', count: 5, description: 'Bu hafta ilk kez gelen müşteriler', cta: { label: 'Listeyi gör', href: '/customers?segment=new' } },
    { id: 'seg-returning', type: 'returning', label: 'Geri Dönen', count: 18, description: 'Bu hafta tekrar randevu alan müşteriler', cta: { label: 'Listeyi gör', href: '/customers?segment=returning' } },
    { id: 'seg-dormant', type: 'dormant', label: 'Uzun Süredir Gelmeyen', count: 12, description: '30 günden fazladır gelmeyen müşteriler', cta: { label: 'Listeyi incele', href: '/customers?segment=dormant' } },
    { id: 'seg-noshow', type: 'no_show_risk', label: 'No-Show Riskli', count: 3, description: 'Daha önce no-show yapmış, tekrar gelmemiş', cta: { label: 'Listeyi incele', href: '/customers?segment=no_show_risk' } },
    { id: 'seg-loyal', type: 'loyal', label: 'Sadık Müşteriler', count: 24, description: 'Son 3 ayda 3+ kez gelen düzenli müşteriler', cta: { label: 'Listeyi gör', href: '/customers?segment=loyal' } },
    { id: 'seg-onetime', type: 'one_time', label: 'Tek Seferlik', count: 15, description: 'Yalnızca bir kez gelip tekrar gelmeyen', cta: { label: 'Listeyi incele', href: '/customers?segment=one_time' } },
  ],

  rebookOpportunities: [
    { id: 'rebook-1', customerName: 'Seda Aydın', lastVisitDaysAgo: 35, lastService: 'Saç Boyama', reason: 'periodic', suggestedAction: 'Saç boyama periyodu gelmiş olabilir', cta: { label: 'Müşteriyi görüntüle', href: '/customers/seda-aydin' } },
    { id: 'rebook-2', customerName: 'Gülşen Kılıç', lastVisitDaysAgo: 42, lastService: 'Keratin Bakım', reason: 'dormant', suggestedAction: 'Uzun süredir gelmiyor, hatırlatma yapılabilir', cta: { label: 'Müşteriyi görüntüle', href: '/customers/gulsen-kilic' } },
    { id: 'rebook-3', customerName: 'Mehmet Kara', lastVisitDaysAgo: 7, lastService: 'Saç Kesimi', reason: 'no_show_lost', suggestedAction: 'No-show sonrası geri dönmedi', cta: { label: 'Müşteriyi görüntüle', href: '/customers/mehmet-kara' } },
    { id: 'rebook-4', customerName: 'İrem Demir', lastVisitDaysAgo: 60, lastService: 'Fön + Bakım', reason: 'one_time', suggestedAction: 'Tek seferlik geldi, ikinci randevu almadı', cta: { label: 'Müşteriyi görüntüle', href: '/customers/irem-demir' } },
    { id: 'rebook-5', customerName: 'Hülya Şahin', lastVisitDaysAgo: 38, lastService: 'Manikür + Pedikür', reason: 'periodic', suggestedAction: 'Periyodik bakım zamanı yaklaşmış olabilir', cta: { label: 'Müşteriyi görüntüle', href: '/customers/hulya-sahin' } },
  ],

  noShowRecoveries: [
    { id: 'nsr-1', customerName: 'Mehmet Kara', noShowDate: todayAt(10, 0), serviceName: 'Saç Kesimi', hasRebooked: false, daysSinceNoShow: 0 },
    { id: 'nsr-2', customerName: 'Burcu Yılmaz', noShowDate: todayAt(9, 0), serviceName: 'Fön', hasRebooked: false, daysSinceNoShow: 3 },
    { id: 'nsr-3', customerName: 'Cem Aksu', noShowDate: todayAt(11, 0), serviceName: 'Saç Kesimi', hasRebooked: true, daysSinceNoShow: 5 },
  ],

  lifecycleHints: [
    { id: 'lch-1', customerName: 'Gülşen Kılıç', message: 'Bu müşteri son 42 gündür gelmedi. Hatırlatma yapılabilir.', type: 'dormant' },
    { id: 'lch-2', customerName: 'İrem Demir', message: 'Bu müşteri yalnızca bir kez geldi. İkinci ziyaret için teşvik düşünülebilir.', type: 'one_time' },
    { id: 'lch-3', customerName: 'Ayşe Korkmaz', message: 'Düzenli müşteri — farklı hizmetler deneyebilir.', type: 'loyal_upsell' },
  ],
};

// ── Stress Test Scenarios ─────────────────────────────────────────────────────

export const MOCK_EMPTY: DashboardData = {
  salonName: 'Studio Bella',
  todayStats: EMPTY_STATS,
  alerts: [], actions: [], liveAppointments: [],
  revenue: null, customers: null,
  appointmentOps: [], staffOps: [], emptySlotOps: [],
  operationsStrip: EMPTY_OPS_STRIP,
  revenueStats: null, serviceStats: [], staffStats: [], capacityStats: null,
  retentionStats: null, customerSegments: [], rebookOpportunities: [], noShowRecoveries: [], lifecycleHints: [],
};

export const MOCK_HIGH_LOAD: DashboardData = {
  salonName: 'Studio Bella',
  todayStats: { totalAppointments: 28, completedAppointments: 14, occupancyPercent: 95, estimatedRevenue: 12_600, pendingCount: 6, cancelledCount: 2, noShowCount: 3, currency: 'TRY' },
  alerts: [
    { id: 'ha-1', type: 'danger', message: 'Bugün 3 no-show — müşterilere hatırlatma gönderin' },
    { id: 'ha-2', type: 'warning', message: 'Stok uyarısı: Keratin seti 2 adet kaldı', action: { label: 'Stok güncelle', href: '/stock' } },
  ],
  actions: Array.from({ length: 12 }, (_, i) => ({
    id: `hact-${i + 1}`,
    type: (['pending_approval', 'upcoming_soon', 'payment_due', 'empty_slot', 'cancelled_recovery'] as const)[i % 5],
    title: ['Onay bekleyen randevu', '10 dk içinde randevu', 'Ödeme bekliyor', 'Boş slot uyarısı', 'İptal edilen müşteri'][i % 5],
    description: `Müşteri ${i + 1} — Hizmet, ${9 + i}:00`,
    cta: { label: ['Randevuyu onayla', 'Randevuyu hazırla', 'Ödemeyi al', 'Takvimde göster', 'Müşteriyi ara'][i % 5], href: `/actions/hact-${i + 1}` },
    urgency: (i < 4 ? 'high' : i < 8 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
  })),
  liveAppointments: Array.from({ length: 20 }, (_, i) => ({
    id: `hla-${i + 1}`, customerName: `Müşteri ${i + 1}`, serviceName: ['Saç Kesimi', 'Fön', 'Keratin', 'Ombre', 'Manikür'][i % 5],
    staffName: ['Selin T.', 'Büşra A.', 'Gamze D.'][i % 3], startTime: todayAt(9 + Math.floor(i / 2), (i % 2) * 30),
    endTime: todayAt(10 + Math.floor(i / 2), (i % 2) * 30), status: (['COMPLETED', 'COMPLETED', 'IN_SERVICE', 'CONFIRMED', 'PENDING'] as AppointmentStatus[])[i % 5],
    price: 200 + i * 50, currency: 'TRY',
  })),
  revenue: { today: 12_600, yesterday: 9_800, thisWeek: 48_200, lastWeek: 38_500, currency: 'TRY', dailyTrend: [7_200, 8_100, 9_800, 10_200, 11_500, 9_800, 12_600] },
  customers: { newThisWeek: 12, returningThisWeek: 32, lostThisMonth: 1, totalActive: 285 },
  appointmentOps: Array.from({ length: 15 }, (_, i) => ({
    id: `hop-${i + 1}`, customerName: `Müşteri ${i + 1}`, customerPhone: `0532 ${100 + i} ${2000 + i}`,
    serviceName: ['Saç Kesimi', 'Fön', 'Keratin', 'Ombre', 'Manikür'][i % 5],
    staffName: ['Selin T.', 'Büşra A.', 'Gamze D.'][i % 3], startTime: todayAt(9 + Math.floor(i / 2), (i % 2) * 30),
    endTime: todayAt(10 + Math.floor(i / 2), (i % 2) * 30),
    status: (['NO_SHOW', 'CONFIRMED', 'IN_SERVICE', 'CHECKED_IN', 'COMPLETED', 'PENDING', 'CANCELLED'] as AppointmentStatus[])[i % 7],
    price: 200 + i * 50, currency: 'TRY', isDelayed: i === 1 || i === 3,
    priority: (i < 3 ? 1 : i < 7 ? 2 : i < 10 ? 3 : 4) as 1 | 2 | 3 | 4,
  })),
  staffOps: [
    { id: 'hs-1', name: 'Selin T.', role: 'Kuaför', todayAppointments: 9, completedAppointments: 5, currentStatus: 'busy', emptySlots: 0, noShowCount: 1, currentCustomer: 'Ayşe K.' },
    { id: 'hs-2', name: 'Büşra A.', role: 'Kuaför', todayAppointments: 10, completedAppointments: 5, currentStatus: 'busy', emptySlots: 0, noShowCount: 1, currentCustomer: 'Fatma Ç.' },
    { id: 'hs-3', name: 'Gamze D.', role: 'Manikür Uzmanı', todayAppointments: 9, completedAppointments: 4, currentStatus: 'busy', emptySlots: 1, noShowCount: 1, currentCustomer: 'Deniz Ö.' },
  ],
  emptySlotOps: [
    { id: 'hes-1', startTime: todayAt(17, 0), endTime: todayAt(18, 0), staffName: 'Gamze D.', reason: 'no_booking' },
  ],
  operationsStrip: {
    activeNow: 6, upcoming30min: 3, delayed: 2, noShows: 3, emptyWindows: 1,
    narratives: [
      'Şu anda 6 aktif işlem var — tüm uzmanlar dolu',
      '30 dakika içinde 3 müşteri daha gelecek',
      '2 müşteri gecikti',
      'Bugün 3 müşteri gelmedi',
    ],
  },
  revenueStats: {
    today: 12_600, yesterday: 9_800, thisWeek: 48_200, lastWeek: 38_500,
    avgAppointmentValue: 630, topServiceName: 'Keratin Bakım', topServiceRevenue: 19_200, topServicePct: 40,
    currency: 'TRY', dailyTrend: [7_200, 8_100, 9_800, 10_200, 11_500, 9_800, 12_600],
  },
  serviceStats: [
    { id: 'hsvc-1', name: 'Keratin Bakım', appointmentCount: 32, totalRevenue: 19_200, avgDuration: 60, occupancyPct: 95, price: 650, isActive: true, currency: 'TRY' },
    { id: 'hsvc-2', name: 'Saç Boyama', appointmentCount: 24, totalRevenue: 16_800, avgDuration: 90, occupancyPct: 90, price: 750, isActive: true, currency: 'TRY' },
    { id: 'hsvc-3', name: 'Saç Kesimi + Fön', appointmentCount: 36, totalRevenue: 12_600, avgDuration: 45, occupancyPct: 88, price: 350, isActive: true, currency: 'TRY' },
    { id: 'hsvc-4', name: 'Ombre', appointmentCount: 10, totalRevenue: 9_000, avgDuration: 120, occupancyPct: 75, price: 900, isActive: true, currency: 'TRY' },
    { id: 'hsvc-5', name: 'Manikür + Pedikür', appointmentCount: 28, totalRevenue: 8_400, avgDuration: 60, occupancyPct: 82, price: 400, isActive: true, currency: 'TRY' },
    { id: 'hsvc-6', name: 'Fön + Bakım', appointmentCount: 20, totalRevenue: 6_000, avgDuration: 40, occupancyPct: 70, price: 300, isActive: true, currency: 'TRY' },
  ],
  staffStats: [
    { id: 'hss-1', name: 'Selin T.', role: 'Kuaför', todayAppointments: 9, completedAppointments: 5, noShowCount: 1, avgServiceDuration: 45, estimatedRevenue: 4_200, availability: 'busy', currency: 'TRY' },
    { id: 'hss-2', name: 'Büşra A.', role: 'Kuaför', todayAppointments: 10, completedAppointments: 5, noShowCount: 1, avgServiceDuration: 68, estimatedRevenue: 5_100, availability: 'busy', currency: 'TRY' },
    { id: 'hss-3', name: 'Gamze D.', role: 'Manikür Uzmanı', todayAppointments: 9, completedAppointments: 4, noShowCount: 1, avgServiceDuration: 52, estimatedRevenue: 3_300, availability: 'busy', currency: 'TRY' },
  ],
  capacityStats: {
    overallOccupancy: 95,
    hourSlots: Array.from({ length: 10 }, (_, i) => ({ hour: 9 + i, occupancy: 80 + Math.round(Math.random() * 20), appointments: 2 + Math.round(Math.random() * 2) })),
    busiestHours: ['09:00', '10:00', '11:00', '14:00', '15:00'],
    emptiestHours: [],
  },
  retentionStats: {
    returningThisWeek: 32, newThisWeek: 12, atRiskCount: 2, oneTimeRate: 8,
    retentionRate: 92, avgVisitFrequencyDays: 21,
  },
  customerSegments: [
    { id: 'hseg-loyal', type: 'loyal', label: 'Sadık Müşteriler', count: 48, description: 'Düzenli gelen müşteriler', cta: { label: 'Listeyi gör', href: '/customers?segment=loyal' } },
    { id: 'hseg-returning', type: 'returning', label: 'Geri Dönen', count: 32, description: 'Bu hafta geri gelen', cta: { label: 'Listeyi gör', href: '/customers?segment=returning' } },
    { id: 'hseg-new', type: 'new', label: 'Yeni Müşteriler', count: 12, description: 'İlk kez gelen', cta: { label: 'Listeyi gör', href: '/customers?segment=new' } },
  ],
  rebookOpportunities: [
    { id: 'hrb-1', customerName: 'Derya Yıldız', lastVisitDaysAgo: 32, lastService: 'Keratin Bakım', reason: 'periodic', suggestedAction: 'Bakım periyodu gelmiş', cta: { label: 'Görüntüle', href: '/customers/derya-yildiz' } },
  ],
  noShowRecoveries: [
    { id: 'hnsr-1', customerName: 'Tolga Can', noShowDate: todayAt(9, 0), serviceName: 'Saç Kesimi', hasRebooked: false, daysSinceNoShow: 2 },
    { id: 'hnsr-2', customerName: 'Elif Demir', noShowDate: todayAt(10, 0), serviceName: 'Fön', hasRebooked: false, daysSinceNoShow: 1 },
  ],
  lifecycleHints: [
    { id: 'hlch-1', customerName: 'Tolga Can', message: 'No-show sonrası geri dönmedi. Hatırlatma yapılabilir.', type: 'dormant' },
  ],
};

export const MOCK_NULL_PARTIAL: DashboardData = {
  salonName: 'Studio Bella',
  todayStats: { totalAppointments: 3, completedAppointments: 1, occupancyPercent: 15, estimatedRevenue: 0, pendingCount: 1, cancelledCount: 0, noShowCount: 0, currency: 'TRY' },
  alerts: [], actions: [
    { id: 'nact-1', type: 'pending_approval', title: 'Onay bekleyen randevu', description: 'Ayşe Kaya — Fön, 14:00', cta: { label: 'Randevuyu onayla', href: '/appointments/nact-1/approve' }, urgency: 'high' },
  ],
  liveAppointments: [
    { id: 'nla-1', customerName: 'Ayşe Kaya', serviceName: 'Fön', staffName: 'Selin T.', startTime: todayAt(14, 0), endTime: todayAt(14, 30), status: 'PENDING', price: 150, currency: 'TRY' },
  ],
  revenue: null, customers: null,
  appointmentOps: [
    { id: 'nop-1', customerName: 'Ayşe Kaya', customerPhone: '0532 111 2233', serviceName: 'Fön', staffName: 'Selin T.', startTime: todayAt(14, 0), endTime: todayAt(14, 30), status: 'PENDING', price: 150, currency: 'TRY', isDelayed: false, priority: 2 },
  ],
  staffOps: [
    { id: 'ns-1', name: 'Selin T.', role: 'Kuaför', todayAppointments: 1, completedAppointments: 0, currentStatus: 'available', emptySlots: 6, noShowCount: 0 },
  ],
  emptySlotOps: [],
  operationsStrip: { activeNow: 0, upcoming30min: 0, delayed: 0, noShows: 0, emptyWindows: 0, narratives: ['Bugün operasyon gerektiren ekstra durum yok'] },
  revenueStats: null, serviceStats: [], staffStats: [], capacityStats: null,
  retentionStats: null, customerSegments: [], rebookOpportunities: [], noShowRecoveries: [], lifecycleHints: [],
};
