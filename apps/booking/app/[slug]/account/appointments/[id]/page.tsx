'use client';

/**
 * APPOINTMENT DETAIL PAGE — Customer Portal Phase 1
 * Randevu detay görüntüleme + iptal.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Calendar, Clock, MapPin, User, Scissors,
  XCircle, AlertCircle, CheckCircle,
} from 'lucide-react';
import {
  fetchAppointmentDetail,
  cancelAppointment,
  AppointmentDetail,
} from '../../../../../lib/customer-api';

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:          { label: 'Beklemede',       color: 'text-amber-700',  bg: 'bg-amber-50' },
  PENDING_PAYMENT:  { label: 'Ödeme Bekleniyor', color: 'text-orange-700', bg: 'bg-orange-50' },
  PAID:             { label: 'Ödendi',          color: 'text-blue-700',   bg: 'bg-blue-50' },
  CONFIRMED:        { label: 'Onaylandı',       color: 'text-green-700',  bg: 'bg-green-50' },
  CHECKED_IN:       { label: 'Geldi',           color: 'text-teal-700',   bg: 'bg-teal-50' },
  IN_SERVICE:       { label: 'Hizmet Devam',    color: 'text-indigo-700', bg: 'bg-indigo-50' },
  COMPLETED:        { label: 'Tamamlandı',       color: 'text-green-700',  bg: 'bg-green-50' },
  CANCELLED:        { label: 'İptal Edildi',     color: 'text-red-700',    bg: 'bg-red-50' },
  NO_SHOW:          { label: 'Gelmedi',          color: 'text-gray-700',   bg: 'bg-gray-100' },
};

export default function AppointmentDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const slug    = params?.slug as string;
  const id      = params?.id   as string;

  const [apt, setApt]             = useState<AppointmentDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    fetchAppointmentDetail(id).then((data) => {
      setApt(data);
      setLoading(false);
    });
  }, [id]);

  const handleCancel = async () => {
    setCancelling(true);
    setError(null);
    const ok = await cancelAppointment(id);
    if (ok) {
      // Refresh data
      const updated = await fetchAppointmentDetail(id);
      setApt(updated);
      setShowConfirm(false);
    } else {
      setError('İptal işlemi başarısız oldu.');
    }
    setCancelling(false);
  };

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Yükleniyor…</div>;
  }

  if (!apt) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Randevu bulunamadı.</p>
        <a href={`/${slug}/account`} className="text-brand-600 text-sm mt-2 inline-block">
          ← Portala Dön
        </a>
      </div>
    );
  }

  const status = STATUS_MAP[apt.status] ?? { label: apt.status, color: 'text-gray-600', bg: 'bg-gray-50' };
  const isCancellable = ['PENDING', 'CONFIRMED', 'PAID', 'PENDING_PAYMENT'].includes(apt.status)
    && new Date(apt.startTime) > new Date();

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <a
        href={`/${slug}/account`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Portala Dön
      </a>

      {/* Status badge */}
      <div className={`${status.bg} ${status.color} px-4 py-3 rounded-xl flex items-center gap-2`}>
        {apt.status === 'COMPLETED' ? <CheckCircle className="w-5 h-5" /> :
         apt.status === 'CANCELLED' ? <XCircle className="w-5 h-5" /> :
         <Calendar className="w-5 h-5" />}
        <span className="font-semibold text-sm">{status.label}</span>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
        {/* Service */}
        <div className="flex items-start gap-3">
          <Scissors className="w-5 h-5 text-brand-500 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900">{apt.service.name}</p>
            <p className="text-sm text-gray-500">
              {apt.service.durationMin} dk. · ₺{apt.service.price}
            </p>
          </div>
        </div>

        {/* Date/time */}
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-brand-500 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">
              {new Date(apt.startTime).toLocaleDateString('tr-TR', {
                day: 'numeric', month: 'long', year: 'numeric', weekday: 'long',
              })}
            </p>
            <p className="text-sm text-gray-500">
              {new Date(apt.startTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              {' — '}
              {new Date(apt.endTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Staff */}
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-brand-500 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">
              {apt.staff.firstName} {apt.staff.lastName}
            </p>
            {apt.staff.title && <p className="text-sm text-gray-500">{apt.staff.title}</p>}
          </div>
        </div>

        {/* Location */}
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-brand-500 mt-0.5" />
          <div>
            <p className="font-medium text-gray-900">{apt.location.name}</p>
            <p className="text-sm text-gray-500">
              {apt.location.address}{apt.location.address && ', '}{apt.location.city}
            </p>
            {apt.location.phone && (
              <p className="text-sm text-gray-500">{apt.location.phone}</p>
            )}
          </div>
        </div>

        {/* Cancellation info */}
        {apt.status === 'CANCELLED' && apt.cancellationReason && (
          <div className="bg-red-50 rounded-xl p-4 text-sm text-red-700">
            <p className="font-medium">İptal Nedeni:</p>
            <p>{apt.cancellationReason}</p>
          </div>
        )}
      </div>

      {/* Cancel action */}
      {isCancellable && !showConfirm && (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full py-3 border-2 border-red-200 text-red-600 font-medium rounded-xl hover:bg-red-50 transition-colors"
        >
          Randevuyu İptal Et
        </button>
      )}

      {showConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-red-800">Randevuyu iptal etmek istediğinizden emin misiniz?</p>
              <p className="text-sm text-red-600 mt-1">Bu işlem geri alınamaz.</p>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="flex-1 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {cancelling ? 'İptal Ediliyor…' : 'Evet, İptal Et'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Rebook CTA */}
      <div className="text-center pt-4">
        <a
          href={`/${slug}#booking`}
          className="text-sm text-brand-600 hover:text-brand-800 font-medium"
        >
          Yeni Randevu Al →
        </a>
      </div>
    </div>
  );
}
