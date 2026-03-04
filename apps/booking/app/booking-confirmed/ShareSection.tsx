'use client';

/**
 * SHARE SECTION — Faz 18: Referral Share Widget (Client Component)
 * ──────────────────────────────────────────────────────────────────────────────
 * booking-confirmed/page.tsx tarafından kullanılır.
 * Clipboard API + WhatsApp deep link içerdiği için 'use client' gerektirir.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';

interface ShareSectionProps {
  referralCode: string;
  salonSlug:    string;
  siteUrl:      string;
}

export function ShareSection({ referralCode, salonSlug, siteUrl }: ShareSectionProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = `${siteUrl}/${salonSlug}?ref=${referralCode}`;
  const waMsg    = encodeURIComponent(
    `Merhaba! Seninle harika bir güzellik salonu keşfettim. Online randevu almak için: ${shareUrl}`,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard erişimi yoksa sessizce geç
    }
  };

  return (
    <div className="bg-gradient-to-br from-brand-50 to-purple-50 rounded-2xl p-5 border border-brand-100 text-left mb-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎁</span>
        <h2 className="text-sm font-bold text-brand-800">
          Arkadaşlarınızı Davet Edin, 50 Puan Kazanın!
        </h2>
      </div>
      <p className="text-xs text-brand-600 mb-3 ml-7">
        Aşağıdaki linki paylaştığınızda arkadaşınız randevu aldığında siz 50 sadakat puanı kazanırsınız.
      </p>

      {/* Link kutusu */}
      <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-brand-100 mb-3">
        <code className="text-xs text-gray-700 flex-1 truncate font-mono">
          {shareUrl}
        </code>
        <button
          onClick={handleCopy}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            copied
              ? 'bg-green-100 text-green-700'
              : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
          }`}
        >
          {copied ? '✓ Kopyalandı' : 'Kopyala'}
        </button>
      </div>

      {/* WhatsApp paylaşım butonu */}
      <a
        href={`https://wa.me/?text=${waMsg}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 w-full justify-center bg-[#25D366]
                   text-white rounded-xl px-4 py-2.5 text-sm font-semibold
                   hover:bg-[#1ebe5d] transition-colors"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
        WhatsApp ile Paylaş
      </a>
    </div>
  );
}
