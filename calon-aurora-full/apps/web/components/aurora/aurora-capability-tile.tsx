"use client";

import React from "react";

interface AuroraCapabilityTileProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export function AuroraCapabilityTile({
  icon,
  title,
  description,
}: AuroraCapabilityTileProps) {
  return (
    <div className="aurora-card p-4 flex items-start gap-3 group cursor-default">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-[rgba(109,76,255,0.08)] text-[#6D4CFF] shrink-0 group-hover:bg-[rgba(109,76,255,0.12)] transition-colors text-sm">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#332B5B] leading-snug">
          {title}
        </p>
        <p className="text-xs text-[#938DB2] mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
