"use client";

import React, { useState } from "react";

export function AuroraAuthPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Preview surface — no real auth
  };

  return (
    <div className="flex flex-col items-center justify-center px-8 py-12 lg:px-12 xl:px-16 min-h-full">
      {/* Brand */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#6D4CFF] to-[#8A5CFF] flex items-center justify-center shadow-[0_4px_20px_rgba(109,76,255,0.20)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-[#332B5B]">
            CALON
          </span>
        </div>
        <p className="text-xs text-[#938DB2] tracking-widest uppercase font-medium">
          Beauty &amp; Wellness Business OS
        </p>
      </div>

      {/* Auth form */}
      <div className="w-full max-w-sm">
        <h2 className="text-xl font-semibold text-[#332B5B] mb-1">
          Giriş Yap
        </h2>
        <p className="text-sm text-[#6E6791] mb-6">
          İşletme panelinize erişmek için giriş yapın.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="aurora-email"
              className="text-xs font-medium text-[#6E6791]"
            >
              E-posta Adresi
            </label>
            <input
              id="aurora-email"
              type="email"
              placeholder="ornek@salon.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="aurora-input w-full px-4 py-2.5 rounded-xl text-sm text-[#332B5B] placeholder:text-[#938DB2]"
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="aurora-password"
                className="text-xs font-medium text-[#6E6791]"
              >
                Şifre
              </label>
              <button
                type="button"
                className="text-xs text-[#6D4CFF] hover:text-[#8A5CFF] transition-colors font-medium"
              >
                Şifremi Unuttum
              </button>
            </div>
            <input
              id="aurora-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="aurora-input w-full px-4 py-2.5 rounded-xl text-sm text-[#332B5B] placeholder:text-[#938DB2]"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="aurora-btn-primary w-full py-2.5 rounded-xl text-sm font-semibold mt-1"
          >
            Giriş Yap
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[rgba(109,76,255,0.08)]" />
          <span className="text-[11px] text-[#938DB2] uppercase tracking-wider font-medium">
            veya devam et
          </span>
          <div className="flex-1 h-px bg-[rgba(109,76,255,0.08)]" />
        </div>

        {/* Social buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            className="aurora-btn-social w-full py-2.5 rounded-xl text-sm font-medium text-[#332B5B] flex items-center justify-center gap-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google ile Devam Et
          </button>

          <button
            type="button"
            className="aurora-btn-social w-full py-2.5 rounded-xl text-sm font-medium text-[#332B5B] flex items-center justify-center gap-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#332B5B">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            Apple ile Devam Et
          </button>

          <button
            type="button"
            className="aurora-btn-social w-full py-2.5 rounded-xl text-sm font-medium text-[#332B5B] flex items-center justify-center gap-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M11.4 24H0V12.6h11.4V24z" fill="#F25022" />
              <path d="M24 24H12.6V12.6H24V24z" fill="#00A4EF" />
              <path d="M11.4 11.4H0V0h11.4v11.4z" fill="#7FBA00" />
              <path d="M24 11.4H12.6V0H24v11.4z" fill="#FFB900" />
            </svg>
            Microsoft ile Devam Et
          </button>
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-sm text-[#6E6791]">
          Hesabın yok mu?{" "}
          <button
            type="button"
            className="text-[#6D4CFF] hover:text-[#8A5CFF] font-semibold transition-colors"
          >
            Kayıt Ol
          </button>
        </p>
      </div>
    </div>
  );
}
