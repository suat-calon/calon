'use client';

/**
 * CUSTOMER PORTAL HOME — Phase 1
 * ──────────────────────────────────────────────────────────────────────────────
 * Unauthenticated: OTP login form
 * Authenticated:   Dashboard (profil + loyalty + appointments)
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Phone, Shield, LogOut, Star, Calendar, Clock, ChevronRight,
  AlertCircle, Sparkles,
} from 'lucide-react';
import {
  requestOtp,
  verifyOtp,
  fetchCustomerMe,
  fetchCustomerAppointments,
  CustomerProfile,
  CustomerAppointment,
} from '../../../lib/customer-api';

// ── Loyalty tier renkleri ───────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  BRONZE:   { label: 'Bronz',    color: 'text-amber-700',   bg: 'bg-amber-50' },
  SILVER:   { label: 'Gümüş',   color: 'text-gray-600',    bg: 'bg-gray-100' },
  GOLD:     { label: 'Altın',    color: 'text-yellow-600',  bg: 'bg-yellow-50' },
  PLATINUM: { label: 'Platin',   color: 'text-purple-600',  bg: 'bg-purple-50' },
};

export default function CustomerPortalPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [phase, setPhase] = useState<'loading' | 'login' | 'otp' | 'dashboard'>('loading');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [upcoming, setUpcoming] = useState<CustomerAppointment[]>([]);
  const [past, setPast] = useState<CustomerAppointment[]>([]);

  // Check existing session on mount
  useEffect(() => {
    fetchCustomerMe().then((me) => {
      if (me) {
        setProfile(me);
        setPhase('dashboard');
        loadAppointments();
      } else {
        setPhase('login');
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAppointments = useCallback(async () => {
    const [u, p] = await Promise.all([
      fetchCustomerAppointments('upcoming'),
      fetchCustomerAppointments('past'),
    ]);
    setUpcoming(u);
    setPast(p);
  }, []);

  // ── Auth handlers ───────────────────────────────────────────────────────

  const handleRequestOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await requestOtp(slug, phone);
      if (result.otpCode) setDevOtp(result.otpCode); // Dev mode
      setPhase('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(slug, phone, otpCode);
      const me = await fetchCustomerMe();
      if (me) {
        setProfile(me);
        setPhase('dashboard');
        await loadAppointments();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Doğrulama başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear cookie by setting expired
    document.cookie = 'calon_customer=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setProfile(null);
    setPhase('login');
    setPhone('');
    setOtpCode('');
    setDevOtp(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return <div className="text-center py-16 text-gray-400">Yükleniyor…</div>;
  }

  // ── LOGIN PHASE ─────────────────────────────────────────────────────────
  if (phase === 'login') {
    return (
      <div className="max-w-sm mx-auto py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto bg-brand-100 rounded-2xl flex items-center justify-center mb-4">
            <Phone className="w-7 h-7 text-brand-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Müşteri Portalı</h2>
          <p className="text-sm text-gray-500 mt-1">Randevularınızı görüntüleyin ve yönetin</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefon Numarası</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+90 5XX XXX XX XX"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleRequestOtp}
            disabled={loading || !phone.trim()}
            className="w-full py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Gönderiliyor…' : 'Doğrulama Kodu Gönder'}
          </button>
        </div>
      </div>
    );
  }

  // ── OTP PHASE ───────────────────────────────────────────────────────────
  if (phase === 'otp') {
    return (
      <div className="max-w-sm mx-auto py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto bg-green-100 rounded-2xl flex items-center justify-center mb-4">
            <Shield className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Doğrulama Kodu</h2>
          <p className="text-sm text-gray-500 mt-1">{phone} numarasına gönderildi</p>
        </div>

        {devOtp && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-center">
            <p className="text-xs text-amber-600 font-medium">Dev Mode — OTP Kodu:</p>
            <p className="text-2xl font-bold text-amber-800 tracking-widest mt-1">{devOtp}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">6 Haneli Kod</label>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-widest font-mono focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleVerifyOtp}
            disabled={loading || otpCode.length !== 6}
            className="w-full py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Doğrulanıyor…' : 'Giriş Yap'}
          </button>

          <button
            onClick={() => { setPhase('login'); setError(null); setOtpCode(''); setDevOtp(null); }}
            className="w-full py-2 text-gray-500 text-sm hover:text-gray-700"
          >
            ← Telefon numarasını değiştir
          </button>
        </div>
      </div>
    );
  }

  // ── DASHBOARD PHASE ─────────────────────────────────────────────────────
  const tier = TIER_CONFIG[profile?.loyaltyTier ?? 'BRONZE'] ?? TIER_CONFIG['BRONZE']!;

  return (
    <div className="space-y-6">
      {/* Profile + Loyalty Header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Hoş geldiniz, {profile?.firstName}!
            </h2>
            <p className="text-sm text-gray-500">{profile?.phone ?? profile?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-600 p-2"
            title="Çıkış"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Loyalty summary */}
        <div className={`${tier.bg} rounded-xl p-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <Sparkles className={`w-5 h-5 ${tier.color}`} />
            <div>
              <p className={`text-sm font-semibold ${tier.color}`}>{tier.label} Üye</p>
              <p className="text-xs text-gray-500">Sadakat programı</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-xl font-bold ${tier.color}`}>{profile?.loyaltyPoints ?? 0}</p>
            <p className="text-xs text-gray-500">puan</p>
          </div>
        </div>
      </div>

      {/* Upcoming Appointments */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-500" />
          Yaklaşan Randevular
        </h3>

        {upcoming.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">Yaklaşan randevunuz bulunmuyor.</p>
            <a
              href={`/${slug}#booking`}
              className="inline-block mt-3 text-sm text-brand-600 hover:text-brand-800 font-medium"
            >
              Randevu Al →
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((apt) => (
              <a
                key={apt.id}
                href={`/${slug}/account/appointments/${apt.id}`}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: apt.staff.colorHex ?? '#6366f1' }}
                  >
                    {apt.staff.firstName[0]}{apt.staff.lastName[0]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{apt.service.name}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(apt.startTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}
                      {' · '}
                      {new Date(apt.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Past Appointments */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          Geçmiş Randevular
        </h3>

        {past.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Henüz geçmiş randevunuz yok.</p>
        ) : (
          <div className="space-y-3">
            {past.slice(0, 5).map((apt) => (
              <a
                key={apt.id}
                href={`/${slug}/account/appointments/${apt.id}`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-medium text-gray-700 text-sm">{apt.service.name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(apt.startTime).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    {' · '}
                    <span className={apt.status === 'COMPLETED' ? 'text-green-500' : apt.status === 'CANCELLED' ? 'text-red-400' : 'text-gray-400'}>
                      {apt.status === 'COMPLETED' ? 'Tamamlandı' : apt.status === 'CANCELLED' ? 'İptal' : apt.status === 'NO_SHOW' ? 'Gelmedi' : apt.status}
                    </span>
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Booking CTA */}
      <div className="text-center">
        <a
          href={`/${slug}#booking`}
          className="inline-flex items-center gap-2 bg-brand-600 text-white font-medium px-6 py-3 rounded-xl hover:bg-brand-700 transition-colors"
        >
          <Star className="w-4 h-4" />
          Yeni Randevu Al
        </a>
      </div>
    </div>
  );
}
