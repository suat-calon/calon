'use client';

/**
 * ALL APPOINTMENTS PAGE — Customer Portal Phase 1
 * Tüm randevular listesi (upcoming + past).
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Clock, ChevronRight } from 'lucide-react';
import { fetchCustomerAppointments, CustomerAppointment } from '../../../../lib/customer-api';

export default function AllAppointmentsPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [upcoming, setUpcoming] = useState<CustomerAppointment[]>([]);
  const [past, setPast]         = useState<CustomerAppointment[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      fetchCustomerAppointments('upcoming'),
      fetchCustomerAppointments('past'),
    ]).then(([u, p]) => {
      setUpcoming(u);
      setPast(p);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Yükleniyor…</div>;
  }

  const renderApt = (apt: CustomerAppointment) => (
    <a
      key={apt.id}
      href={`/${slug}/account/appointments/${apt.id}`}
      className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-brand-200 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
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
            {' · '}
            <span className={
              apt.status === 'COMPLETED' ? 'text-green-500' :
              apt.status === 'CANCELLED' ? 'text-red-400' :
              apt.status === 'CONFIRMED' ? 'text-green-600' :
              'text-amber-500'
            }>
              {apt.status === 'COMPLETED' ? 'Tamamlandı' :
               apt.status === 'CANCELLED' ? 'İptal' :
               apt.status === 'CONFIRMED' ? 'Onaylandı' :
               apt.status === 'NO_SHOW' ? 'Gelmedi' :
               apt.status === 'PENDING' ? 'Beklemede' : apt.status}
            </span>
          </p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
    </a>
  );

  return (
    <div className="space-y-6">
      <a
        href={`/${slug}/account`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4" /> Portala Dön
      </a>

      {/* Upcoming */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-brand-500" />
          Yaklaşan ({upcoming.length})
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Yaklaşan randevu yok.</p>
        ) : (
          <div className="space-y-2">{upcoming.map(renderApt)}</div>
        )}
      </div>

      {/* Past */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-400" />
          Geçmiş ({past.length})
        </h3>
        {past.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Geçmiş randevu yok.</p>
        ) : (
          <div className="space-y-2">{past.map(renderApt)}</div>
        )}
      </div>
    </div>
  );
}
