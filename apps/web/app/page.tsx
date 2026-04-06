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

// ── HERO ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-purple-50/30 to-white dark:from-background dark:via-purple-950/10 dark:to-background">
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-14 lg:pt-24 lg:pb-20">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-200/60 bg-purple-50/60 px-3.5 py-1 text-[13px] font-medium text-purple-700 dark:border-purple-800/40 dark:bg-purple-950/30 dark:text-purple-300 mb-5">
            <Sparkles className="h-3.5 w-3.5" />
            Beauty & Wellness Business OS
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-foreground lg:text-5xl lg:leading-[1.15]">
            Salonunuzu tek sistemden yönetin
          </h1>

          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Randevu, ekip, müşteri, ödeme — hepsi tek yerden.
            Calon, güzellik ve wellness işletmeleri için tasarlanmış işletme yönetim sistemidir.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-12 px-7 text-[15px] font-semibold">
              <Link href="/register">
                Demo Talep Et
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-7 text-[15px] font-medium">
              <a href="#urun">Ürünü İncele</a>
            </Button>
          </div>

          <p className="mt-4 text-[13px] text-muted-foreground/70">
            Kredi kartı gerekmez · 5 dakikada kurulum · Ücretsiz deneme
          </p>
        </div>
      </div>
    </section>
  );
}

// ── TRUST BAND ──────────────────────────────────────────────────────────────

function TrustBand() {
  const signals = [
    { icon: Globe, text: '7/24 online randevu' },
    { icon: Shield, text: 'Güvenli bulut altyapısı' },
    { icon: Clock, text: 'Gerçek zamanlı takvim' },
    { icon: Smartphone, text: 'Mobil uyumlu' },
  ];

  return (
    <section className="border-y border-border/40 bg-muted/30 dark:bg-card/20">
      <div className="mx-auto max-w-6xl px-6 py-4">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2">
          {signals.map((s) => (
            <div key={s.text} className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
              <s.icon className="h-4 w-4 text-primary/70" />
              {s.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CORE VALUE ──────────────────────────────────────────────────────────────

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
      <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <div className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/70 mb-2">Neden Calon?</p>
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Salonunuzun ihtiyacı olan her şey, tek yerde
          </h2>
          <p className="mt-2.5 text-muted-foreground max-w-xl mx-auto text-[15px]">
            Dağınık araçları bırakın. Randevudan müşteri takibine, ekipten rapora — tek sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {values.map((v) => (
            <div key={v.title} className="rounded-xl border bg-card p-5 space-y-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <v.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <h3 className="text-[15px] font-semibold">{v.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── PRODUCT PROOF ───────────────────────────────────────────────────────────

function ProductProof() {
  const surfaces = [
    {
      icon: Globe,
      label: 'Online Rezervasyon ve Salon Vitrini',
      title: 'Müşterileriniz kendi randevusunu alsın',
      desc: 'Markalı rezervasyon sayfanız 7/24 açık. Hizmet seçimi, personel tercihi, uygun saat bulma — müşteri deneyimi sizin kontrolünüzde.',
      features: ['Hizmet ve personel seçimi', 'Otomatik uygunluk kontrolü', 'Mobil uyumlu rezervasyon', 'Salon vitrini ve tanıtım'],
      accent: 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30',
      iconAccent: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',
    },
    {
      icon: Monitor,
      label: 'Salon Operasyon Paneli',
      title: 'Günlük operasyonu tek ekrandan yönetin',
      desc: 'Takvim görünümü, randevu detayları, müşteri notları, ödeme takibi — salon sahiplerinin günlük komuta merkezi.',
      features: ['Günlük/haftalık takvim', 'Personel bazlı görünüm', 'Müşteri geçmişi ve notlar', 'Ödeme ve kasa takibi'],
      accent: 'bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30',
      iconAccent: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400',
    },
    {
      icon: Layers,
      label: 'Büyümeye Uygun İşletme Altyapısı',
      title: 'Küçük başlayın, sınırsız büyüyün',
      desc: 'Tek şubeden çoklu lokasyona, birkaç hizmetten geniş kataloğa. Altyapı sizi yavaşlatmaz — büyümenizi destekler.',
      features: ['Çoklu şube desteği', 'Hizmet ve katalog düzeni', 'Ekip ölçeklendirme', 'Platform seviyesinde kontrol'],
      accent: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30',
      iconAccent: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <section id="urun" className="bg-muted/20 dark:bg-card/10">
      <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <div className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/70 mb-2">Ürün</p>
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Gerçek ürün, gerçek yüzeyler
          </h2>
          <p className="mt-2.5 text-muted-foreground max-w-xl mx-auto text-[15px]">
            Calon bir konsept değil — çalışan, kullanılan, her gün işletmelere değer üreten bir sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {surfaces.map((s) => (
            <div key={s.label} className={`rounded-xl border p-6 space-y-4 ${s.accent}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.iconAccent}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">{s.label}</p>
                <h3 className="text-[16px] font-bold tracking-tight">{s.title}</h3>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
              <ul className="space-y-1.5 pt-1">
                {s.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-foreground/80">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
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

// ── WHO IT'S FOR ────────────────────────────────────────────────────────────

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
      <div className="mx-auto max-w-6xl px-6 py-14 lg:py-20">
        <div className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/70 mb-2">Kimin İçin?</p>
          <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">
            Her ölçekte salon için
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {segments.map((s) => (
            <div key={s.title} className="rounded-xl border bg-card p-5 space-y-2.5 text-center">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                <s.icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <h3 className="text-[15px] font-semibold">{s.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FINAL CTA ───────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="bg-primary/5 dark:bg-primary/10 border-t border-border/40">
      <div className="mx-auto max-w-3xl px-6 py-14 lg:py-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight lg:text-3xl">
          Salonunuzu Calon'a taşıyın
        </h2>
        <p className="mt-3 text-muted-foreground max-w-lg mx-auto text-[15px]">
          5 dakikada kurun. Hizmetlerinizi, ekibinizi ve takviminizi ekleyin.
          Müşterileriniz hemen online randevu almaya başlasın.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="h-12 px-8 text-[15px] font-semibold">
            <Link href="/register">
              Demo Talep Et
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-8 text-[15px] font-medium">
            <a href="#urun">Ürünü İncele</a>
          </Button>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground/60">
          Kredi kartı gerekmez · Ücretsiz deneme
        </p>
      </div>
    </section>
  );
}

// ── FOOTER ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">C</span>
            </div>
            <span className="text-sm font-semibold tracking-tight">Calon</span>
            <span className="text-[11px] text-muted-foreground/60">Salon Operating System</span>
          </div>
          <div className="flex items-center gap-6 text-[13px] text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Giriş Yap</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Kayıt Ol</Link>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-border/30 text-center">
          <p className="text-[11px] text-muted-foreground/50">
            © {new Date().getFullYear()} Calon. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ── PAGE ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-bold">C</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Calon</span>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="text-[13px]">
              <Link href="/login">Giriş Yap</Link>
            </Button>
            <Button asChild size="sm" className="text-[13px]">
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
