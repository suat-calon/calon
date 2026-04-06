import Link from 'next/link';
import {
  Calendar, Users, BarChart3, Clock, Shield,
  ArrowRight, CheckCircle2, Building2, Sparkles, Globe,
  Layers, Monitor, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Calon — Salon Operating System',
  description: 'Güzellik ve wellness işletmeleri için randevu, ekip, müşteri ve operasyon yönetim sistemi.',
};

/* ═══════════════════════════════════════════════════════════════════════════
   SHELL — viewport-aware containers
   ═══════════════════════════════════════════════════════════════════════════ */

const shell   = 'mx-auto w-full max-w-[1440px] 2xl:max-w-[1600px] px-6 sm:px-8 lg:px-12';
const narrow  = 'mx-auto max-w-3xl lg:max-w-4xl';

/* ═══════════════════════════════════════════════════════════════════════════
   HERO
   ═══════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-100/20 via-brand-50/10 to-transparent dark:from-brand-950/20 dark:via-brand-950/5 dark:to-transparent pointer-events-none" />
      <div className="absolute top-20 -left-40 w-[600px] h-[600px] rounded-full bg-brand-200/20 dark:bg-brand-500/8 blur-3xl pointer-events-none" />
      <div className="absolute top-40 right-0 w-[500px] h-[500px] rounded-full bg-brand-200/10 dark:bg-brand-400/5 blur-3xl pointer-events-none" />

      <div className={`${shell} relative pt-20 pb-16 lg:pt-28 lg:pb-24`}>
        <div className="max-w-[860px]">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2.5 rounded-full border border-brand-200/60 bg-brand-50/60 px-5 py-2 text-[16px] font-semibold text-brand-700 dark:border-brand-600/40 dark:bg-brand-950/40 dark:text-brand-300 mb-7 shadow-sm">
            <Sparkles className="h-4 w-4" />
            Beauty & Wellness Business OS
          </div>

          {/* Heading — fluid type */}
          <h1
            className="font-bold tracking-tight text-foreground"
            style={{ fontSize: 'clamp(2.5rem, 5vw + 1rem, 4.5rem)', lineHeight: 1.08 }}
          >
            Salonunuzu tek sistemden yönetin
          </h1>

          {/* Lead */}
          <p
            className="mt-6 text-muted-foreground leading-relaxed max-w-[660px]"
            style={{ fontSize: 'clamp(1.2rem, 1.5vw + 0.5rem, 1.6rem)' }}
          >
            Randevu, ekip, müşteri, ödeme — hepsi tek yerden.
            Calon, güzellik ve wellness işletmeleri için tasarlanmış işletme yönetim sistemidir.
          </p>

          {/* CTAs */}
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="h-14 px-9 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-accent/10 motion-safe:active:scale-[0.97] transition-all duration-150">
              <Link href="/register">
                Demo Talep Et
                <ArrowRight className="ml-2.5 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 px-9 text-lg font-medium border-foreground/20 hover:bg-foreground/5">
              <a href="#urun">Ürünü İncele</a>
            </Button>
          </div>

          {/* Micro trust */}
          <p className="mt-5 text-[15px] text-muted-foreground/60">
            Kredi kartı gerekmez · 5 dakikada kurulum · Ücretsiz deneme
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TRUST BAND
   ═══════════════════════════════════════════════════════════════════════════ */

function TrustBand() {
  const signals = [
    { icon: Globe, text: '7/24 online randevu' },
    { icon: Shield, text: 'Güvenli bulut altyapısı' },
    { icon: Clock, text: 'Gerçek zamanlı takvim' },
    { icon: Smartphone, text: 'Mobil uyumlu' },
  ];

  return (
    <section className="border-y border-border/40 bg-muted/30 dark:bg-muted/20">
      <div className={`${shell} py-5`}>
        <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-3">
          {signals.map((s) => (
            <div key={s.text} className="flex items-center gap-2.5 text-[15px] font-medium text-muted-foreground">
              <s.icon className="h-5 w-5 text-primary/60" />
              {s.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CORE VALUE — "Neden Calon?"
   ═══════════════════════════════════════════════════════════════════════════ */

function CoreValue() {
  const values = [
    {
      icon: Calendar,
      title: 'Online randevu, otomatik takvim',
      desc: 'Müşterileriniz 7/24 online randevu alır. Takvim, personel ve hizmet otomatik eşleşir. Çift rezervasyon olmaz.',
    },
    {
      icon: Users,
      title: 'Ekip ve hizmet yönetimi',
      desc: 'Personel programları, hizmet kataloğu, çalışma saatleri, mola düzeni — tek panelden kontrol edin.',
    },
    {
      icon: BarChart3,
      title: 'Müşteri takibi ve işletme görünürlüğü',
      desc: 'Müşteri geçmişi, tekrar ziyaret takibi, günlük özet — işletmenizin nabzını tutun.',
    },
  ];

  return (
    <section className="bg-background">
      <div className={`${shell} py-20 lg:py-28`}>
        <div className="text-center mb-14">
          <p className="text-[15px] font-bold uppercase tracking-[0.2em] text-primary/70 mb-4">Neden Calon?</p>
          <h2
            className="font-bold tracking-tight text-foreground"
            style={{ fontSize: 'clamp(1.75rem, 3vw + 0.5rem, 3rem)' }}
          >
            Salonunuzun ihtiyacı olan her şey, tek yerde
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
            Dağınık araçları bırakın. Randevudan müşteri takibine, ekipten rapora — tek sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border/50 bg-card dark:bg-card dark:border-border p-9 lg:p-10 space-y-4 transition-all duration-200 hover:border-primary/20 dark:hover:border-primary/30 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-lg dark:hover:shadow-primary/10">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <v.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-[22px] font-semibold tracking-tight">{v.title}</h3>
              <p className="text-[17px] text-muted-foreground leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRODUCT PROOF — "Gerçek ürün, gerçek yüzeyler"
   ═══════════════════════════════════════════════════════════════════════════ */

function ProductProof() {
  const surfaces = [
    {
      icon: Globe,
      label: 'Online Rezervasyon',
      title: 'Müşterileriniz kendi randevusunu alsın',
      desc: 'Markalı rezervasyon sayfanız 7/24 açık. Hizmet seçimi, personel tercihi, uygun saat bulma — müşteri deneyimi sizin kontrolünüzde.',
      features: ['Hizmet ve personel seçimi', 'Otomatik uygunluk kontrolü', 'Mobil uyumlu rezervasyon', 'Salon vitrini ve tanıtım'],
      bg: 'bg-brand-50/60 dark:bg-brand-950/30',
      border: 'border-brand-200/60 dark:border-brand-700/30',
      iconBg: 'bg-brand-100 dark:bg-brand-900/50',
      iconColor: 'text-brand-600 dark:text-brand-400',
    },
    {
      icon: Monitor,
      label: 'Salon Paneli',
      title: 'Günlük operasyonu tek ekrandan yönetin',
      desc: 'Takvim görünümü, randevu detayları, müşteri notları, ödeme takibi — salon sahiplerinin günlük komuta merkezi.',
      features: ['Günlük/haftalık takvim', 'Personel bazlı görünüm', 'Müşteri geçmişi ve notlar', 'Ödeme ve kasa takibi'],
      bg: 'bg-brand-100/50 dark:bg-brand-900/20',
      border: 'border-brand-300/60 dark:border-brand-600/40',
      iconBg: 'bg-brand-200/60 dark:bg-brand-800/50',
      iconColor: 'text-brand-700 dark:text-brand-300',
      featured: true,
    },
    {
      icon: Layers,
      label: 'İşletme Altyapısı',
      title: 'Küçük başlayın, sınırsız büyüyün',
      desc: 'Tek şubeden çoklu lokasyona, birkaç hizmetten geniş kataloğa. Altyapı sizi yavaşlatmaz — büyümenizi destekler.',
      features: ['Çoklu şube desteği', 'Hizmet ve katalog düzeni', 'Ekip ölçeklendirme', 'Platform seviyesinde kontrol'],
      bg: 'bg-emerald-50/80 dark:bg-emerald-950/20',
      border: 'border-emerald-200/60 dark:border-emerald-700/30',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/50',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <section id="urun" className="bg-muted/30 dark:bg-muted/20 border-y border-border/30">
      <div className={`${shell} py-20 lg:py-28`}>
        <div className="text-center mb-14">
          <p className="text-[15px] font-bold uppercase tracking-[0.2em] text-primary/70 mb-4">Ürün</p>
          <h2
            className="font-bold tracking-tight text-foreground"
            style={{ fontSize: 'clamp(1.75rem, 3vw + 0.5rem, 3rem)' }}
          >
            Gerçek ürün, gerçek yüzeyler
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
            Calon bir konsept değil — çalışan, kullanılan, her gün işletmelere değer üreten bir sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {surfaces.map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl border p-9 lg:p-10 space-y-5 transition-all duration-200 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-xl ${s.bg} ${s.border} ${s.featured ? 'lg:scale-[1.02] lg:shadow-xl lg:shadow-primary/8 ring-1 ring-brand-300/30 dark:ring-brand-500/20' : ''}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.iconBg}`}>
                <s.icon className={`h-6 w-6 ${s.iconColor}`} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/60 mb-2">{s.label}</p>
                <h3 className="text-xl font-bold tracking-tight">{s.title}</h3>
              </div>
              <p className="text-[17px] text-muted-foreground leading-relaxed">{s.desc}</p>
              <ul className="space-y-2.5 pt-1">
                {s.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-[16px] text-foreground/80">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   WHO IT'S FOR
   ═══════════════════════════════════════════════════════════════════════════ */

function WhoItsFor() {
  const segments = [
    {
      icon: Sparkles,
      title: 'Tek şubeli butik salon',
      desc: 'Randevu karmaşasını bitirin. Online rezervasyon, otomatik takvim, müşteri takibi — küçük ama düzenli.',
    },
    {
      icon: Building2,
      title: 'Büyüyen salon',
      desc: 'Ekip genişliyor, hizmet çeşitleniyor. Personel yönetimi, katalog düzeni, operasyon kontrolü — büyümeye hazır.',
    },
    {
      icon: BarChart3,
      title: 'Çoklu şube / yoğun operasyon',
      desc: 'Birden fazla lokasyon, karmaşık program, yüksek hacim — ölçeklenebilir altyapı ve platform kontrolü.',
    },
  ];

  return (
    <section className="bg-background">
      <div className={`${shell} py-20 lg:py-28`}>
        <div className="text-center mb-14">
          <p className="text-[15px] font-bold uppercase tracking-[0.2em] text-primary/70 mb-4">Kimin İçin?</p>
          <h2
            className="font-bold tracking-tight text-foreground"
            style={{ fontSize: 'clamp(1.75rem, 3vw + 0.5rem, 3rem)' }}
          >
            Her ölçekte salon için
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {segments.map((s) => (
            <div key={s.title} className="rounded-2xl border border-border/50 bg-card dark:bg-card dark:border-border p-9 lg:p-10 space-y-4 text-center transition-all duration-200 hover:border-primary/20 dark:hover:border-primary/30 motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-lg dark:hover:shadow-primary/10">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-[22px] font-semibold tracking-tight">{s.title}</h3>
              <p className="text-[17px] text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FINAL CTA
   ═══════════════════════════════════════════════════════════════════════════ */

function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-brand-50/30 dark:bg-brand-950/20 border-t border-border/30">
      {/* Glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[300px] rounded-full bg-brand-200/20 dark:bg-brand-500/8 blur-3xl" />
      </div>

      <div className={`${narrow} relative px-6 py-20 lg:py-28 text-center`}>
        <h2
          className="font-bold tracking-tight text-foreground"
          style={{ fontSize: 'clamp(1.75rem, 3vw + 0.5rem, 3rem)' }}
        >
          Salonunuzu Calon'a taşıyın
        </h2>
        <p className="mt-5 text-muted-foreground max-w-xl mx-auto text-lg leading-relaxed">
          5 dakikada kurun. Hizmetlerinizi, ekibinizi ve takviminizi ekleyin.
          Müşterileriniz hemen online randevu almaya başlasın.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="h-14 px-9 text-lg font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-accent/10 motion-safe:active:scale-[0.97] transition-all duration-150">
            <Link href="/register">
              Demo Talep Et
              <ArrowRight className="ml-2.5 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 px-9 text-lg font-medium border-foreground/20 hover:bg-foreground/5">
            <a href="#urun">Ürünü İncele</a>
          </Button>
        </div>
        <p className="mt-5 text-[15px] text-muted-foreground/60">
          Kredi kartı gerekmez · Ücretsiz deneme
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="border-t border-border/30 bg-background">
      <div className={`${shell} py-10`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground text-base font-bold">C</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Calon</span>
            <span className="text-sm text-muted-foreground/50">Salon Operating System</span>
          </div>
          <div className="flex items-center gap-8 text-base text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Giriş Yap</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Kayıt Ol</Link>
          </div>
        </div>
        <div className="mt-6 pt-5 border-t border-border/20 text-center">
          <p className="text-sm text-muted-foreground/40">
            © {new Date().getFullYear()} Calon. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <div className={`${shell} h-[72px] flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <span className="text-primary-foreground text-base font-bold">C</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Calon</span>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" className="text-[15px] text-muted-foreground hover:text-foreground">
              <Link href="/login">Giriş Yap</Link>
            </Button>
            <Button asChild className="text-[15px] px-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-accent/10">
              <Link href="/register">Demo Talep Et</Link>
            </Button>
          </div>
        </div>
      </header>

      <Hero />
      <TrustBand />
      <CoreValue />
      <ProductProof />
      <WhoItsFor />
      <FinalCTA />
      <Footer />
    </div>
  );
}
