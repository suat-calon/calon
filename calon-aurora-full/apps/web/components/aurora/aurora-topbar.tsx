"use client";

import React from "react";

export function AuroraTopbar() {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(255,255,255,0.40)]">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tight text-[#6D4CFF]">
          CALON
        </span>
        <span className="text-[10px] text-[#938DB2] bg-[rgba(109,76,255,0.06)] px-2 py-0.5 rounded-full font-medium">
          Business OS
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Tenant pill */}
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-[#6E6791] bg-[rgba(255,255,255,0.50)] px-3 py-1.5 rounded-full border border-[rgba(255,255,255,0.50)]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 aurora-glow-dot" />
          Studio Bella
        </span>

        {/* Notification */}
        <button className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[rgba(109,76,255,0.06)] transition-colors relative"
                type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6E6791" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#C86BFF] border border-white" />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6D4CFF] to-[#8A5CFF] flex items-center justify-center text-white text-[10px] font-semibold cursor-pointer">
          SÖ
        </div>

        {/* More */}
        <button className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-[rgba(109,76,255,0.06)] transition-colors"
                type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#6E6791">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
