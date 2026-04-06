"use client";

import React from "react";

interface StaffMember {
  name: string;
  role: string;
  avatar: string;
  rating: number;
  appointments: number;
}

const mockStaff: StaffMember[] = [
  {
    name: "Elif Yılmaz",
    role: "Kıdemli Stilist",
    avatar: "EY",
    rating: 4.9,
    appointments: 28,
  },
  {
    name: "Mert Aydın",
    role: "Renk Uzmanı",
    avatar: "MA",
    rating: 4.8,
    appointments: 24,
  },
  {
    name: "Zeynep Demir",
    role: "Cilt Bakım Uzmanı",
    avatar: "ZD",
    rating: 4.7,
    appointments: 19,
  },
  {
    name: "Can Özkan",
    role: "Saç Bakım Uzmanı",
    avatar: "CÖ",
    rating: 4.9,
    appointments: 31,
  },
];

const avatarColors = [
  { bg: "bg-[rgba(109,76,255,0.12)]", text: "text-[#6D4CFF]" },
  { bg: "bg-[rgba(200,107,255,0.12)]", text: "text-[#C86BFF]" },
  { bg: "bg-[rgba(126,215,255,0.14)]", text: "text-[#3BA8D8]" },
  { bg: "bg-[rgba(109,76,255,0.10)]", text: "text-[#8A5CFF]" },
];

export function AuroraStaffCard() {
  return (
    <div className="aurora-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#332B5B]">
          Ekip Performansı
        </h3>
        <span className="text-xs text-[#938DB2] cursor-pointer hover:text-[#6D4CFF] transition-colors">
          Tümünü Gör
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {mockStaff.map((member, i) => (
          <div
            key={member.name}
            className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[rgba(109,76,255,0.03)] transition-colors"
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColors[i % avatarColors.length].bg} ${avatarColors[i % avatarColors.length].text}`}
            >
              {member.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#332B5B] truncate">
                {member.name}
              </p>
              <p className="text-xs text-[#938DB2] truncate">{member.role}</p>
            </div>
            <div className="flex items-center gap-3 text-xs shrink-0">
              <span className="text-[#6E6791]">
                <span className="text-amber-500">★</span> {member.rating}
              </span>
              <span className="text-[#938DB2]">
                {member.appointments} randevu
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
