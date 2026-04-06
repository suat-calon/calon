"use client";

import React from "react";

interface AuroraKpiCardProps {
  label: string;
  value: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  icon: React.ReactNode;
}

export function AuroraKpiCard({
  label,
  value,
  change,
  changeType = "up",
  icon,
}: AuroraKpiCardProps) {
  const changeColor =
    changeType === "up"
      ? "text-emerald-600"
      : changeType === "down"
        ? "text-rose-500"
        : "text-[#938DB2]";

  const changeArrow =
    changeType === "up" ? "↑" : changeType === "down" ? "↓" : "";

  return (
    <div className="aurora-card p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide uppercase text-[#938DB2]">
          {label}
        </span>
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-[rgba(109,76,255,0.08)] text-[#6D4CFF]">
          {icon}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-[#332B5B] tracking-tight">
          {value}
        </span>
        {change && (
          <span className={`text-xs font-medium pb-0.5 ${changeColor}`}>
            {changeArrow} {change}
          </span>
        )}
      </div>
    </div>
  );
}
