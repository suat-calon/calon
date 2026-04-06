"use client";

import React from "react";
import { AuroraTopbar } from "./aurora-topbar";
import { AuroraSidebar } from "./aurora-sidebar";
import { AuroraKpiCard } from "./aurora-kpi-card";
import { AuroraStaffCard } from "./aurora-staff-card";
import { AuroraBarChart, AuroraDonutChart } from "./aurora-chart-card";
import { AuroraCapabilityTile } from "./aurora-capability-tile";

export function AuroraDashboardPanel() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <AuroraTopbar />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar — hidden on mobile */}
        <div className="hidden lg:block">
          <AuroraSidebar />
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
          {/* Dashboard header */}
          <div className="mb-1">
            <h2 className="text-lg font-semibold text-[#332B5B]">
              Genel Bakış
            </h2>
            <p className="text-xs text-[#938DB2]">
              Bugünkü işletme performansınız
            </p>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <AuroraKpiCard
              label="Toplam Gelir"
              value="₺48.250"
              change="12.4%"
              changeType="up"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
            <AuroraKpiCard
              label="Bugünkü Randevular"
              value="24"
              change="3"
              changeType="up"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              }
            />
            <AuroraKpiCard
              label="Yeni Mesajlar"
              value="8"
              change="2"
              changeType="neutral"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              }
            />
            <AuroraKpiCard
              label="Müşteri Dönüşümü"
              value="%72"
              change="5.2%"
              changeType="up"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <polyline points="23 6 23 1 18 1" />
                  <line x1="16" y1="8" x2="23" y2="1" />
                </svg>
              }
            />
          </div>

          {/* Charts + Staff row */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="xl:col-span-1">
              <AuroraBarChart />
            </div>
            <div className="xl:col-span-1">
              <AuroraDonutChart />
            </div>
            <div className="xl:col-span-1">
              <AuroraStaffCard />
            </div>
          </div>

          {/* Capability tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 pt-1">
            <AuroraCapabilityTile
              title="Randevu ve Takvim"
              description="Akıllı çakışma önleme ile randevu yönetimi"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <path d="M9 15l2 2 4-4" />
                </svg>
              }
            />
            <AuroraCapabilityTile
              title="Ekip Takibi"
              description="Performans, kapasite ve adil iş dağılımı"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
              }
            />
            <AuroraCapabilityTile
              title="Gelir Görünürlüğü"
              description="Gerçek zamanlı satış ve müşteri metrikleri"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              }
            />
            <AuroraCapabilityTile
              title="Operasyon Kontrolü"
              description="Hizmetler, stok ve işletme ayarları tek merkezden"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
