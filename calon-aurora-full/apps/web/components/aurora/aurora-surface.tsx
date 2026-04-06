"use client";

import React from "react";
import { AuroraAuthPanel } from "./aurora-auth-panel";
import { AuroraDashboardPanel } from "./aurora-dashboard-panel";

export function AuroraSurface() {
  return (
    <div className="aurora-bg flex items-center justify-center p-4 md:p-6 lg:p-8">
      {/* Main glass shell */}
      <div className="relative z-10 w-full max-w-[1440px] min-h-[calc(100vh-4rem)] aurora-glass-strong rounded-3xl overflow-hidden shadow-[0_8px_60px_rgba(109,76,255,0.08)]">
        <div className="flex flex-col lg:flex-row h-full min-h-[calc(100vh-4rem)]">
          {/* Left panel — Auth */}
          <div className="lg:w-[36%] shrink-0 border-b lg:border-b-0 lg:border-r border-[rgba(255,255,255,0.35)]">
            <AuroraAuthPanel />
          </div>

          {/* Divider — decorative on desktop */}
          <div className="aurora-divider hidden lg:block" />

          {/* Right panel — Dashboard preview */}
          <div className="flex-1 min-w-0">
            <AuroraDashboardPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
