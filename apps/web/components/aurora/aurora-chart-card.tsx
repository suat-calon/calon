"use client";

import React from "react";

const barData = [
  { label: "Pzt", value: 65 },
  { label: "Sal", value: 82 },
  { label: "Çar", value: 74 },
  { label: "Per", value: 91 },
  { label: "Cum", value: 88 },
  { label: "Cmt", value: 96 },
  { label: "Paz", value: 42 },
];

const maxBar = Math.max(...barData.map((d) => d.value));

export function AuroraBarChart() {
  return (
    <div className="aurora-card p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[#332B5B]">
          Haftalık Gelir Özeti
        </h3>
        <span className="text-xs text-[#938DB2]">Bu hafta</span>
      </div>

      <div className="flex items-end gap-2 h-32">
        {barData.map((d) => {
          const heightPct = (d.value / maxBar) * 100;
          return (
            <div
              key={d.label}
              className="flex-1 flex flex-col items-center gap-1.5"
            >
              <span className="text-[10px] text-[#938DB2] font-medium">
                {d.value}%
              </span>
              <div className="w-full relative rounded-t-lg overflow-hidden bg-[rgba(109,76,255,0.06)]"
                   style={{ height: "100px" }}>
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${heightPct}%`,
                    background: `linear-gradient(180deg, #8A5CFF 0%, #6D4CFF 100%)`,
                    opacity: 0.7 + (d.value / maxBar) * 0.3,
                  }}
                />
              </div>
              <span className="text-[10px] text-[#938DB2]">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const donutSegments = [
  { label: "Saç Bakım", value: 38, color: "#6D4CFF" },
  { label: "Cilt Bakım", value: 24, color: "#8A5CFF" },
  { label: "Tırnak", value: 18, color: "#C86BFF" },
  { label: "Masaj", value: 20, color: "#7ED7FF" },
];

export function AuroraDonutChart() {
  const total = donutSegments.reduce((sum, s) => sum + s.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="aurora-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#332B5B]">
          Hizmet Dağılımı
        </h3>
        <span className="text-xs text-[#938DB2]">Bu ay</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {donutSegments.map((segment) => {
              const segmentLength = (segment.value / total) * circumference;
              const gapSize = 3;
              const adjustedLength = segmentLength - gapSize;
              const offset = cumulativeOffset;
              cumulativeOffset += segmentLength;

              return (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="14"
                  strokeDasharray={`${adjustedLength} ${circumference - adjustedLength}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  opacity="0.85"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-semibold text-[#332B5B]">
              {total}%
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          {donutSegments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-xs text-[#6E6791] truncate">
                {segment.label}
              </span>
              <span className="text-xs font-medium text-[#332B5B] ml-auto">
                {segment.value}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
