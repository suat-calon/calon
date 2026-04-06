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
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-purple-50/30 to-white dark:from-background dark:via-purple-950/20 dark:to-background">
      <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
        <div className="max-w-[820px]">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-purple-200/60 bg-purple-50/60 px-5 py-2 text-base font-medium text-purple-700 dark:border-purple-700/50 dark:bg-purple-950/40 dark:text-purple-300 mb-7">
            <Sparkles className="h-4.5 w-4.5" />
            Beauty & Wellness Business OS
          </div>

          <h1 className="text-6xl font-bold tracking-tight text-foreground xl:text-7xl xl:leading-[1.08]">
            Salonunuzu tek sistemden yönetin
          </h1>

          <p className="mt-6 text-xl text-muted-foreground leading-relaxed max-w-[640px] xl:text-2xl xl:leading-relaxed">
            Randevu, ekip, müşteri, ödeme — hepsi tek yerden.
            Calon, güzellik ve wellness işletmeleri için tasarlanmış işletme yönetim sistemidir.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="h-14 px-9 text-lg font-semibold">
              <Link href="/register">
                Demo Talep Et
                <ArrowRight className="ml-2.5 h-5 w-5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 px-9 text-lg font-medium">
              <a href="#urun">Ürünü İncele</a>
            </Button>
          </div>

          <p className="mt-5 text-base text-muted-foreground/70">
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
    <section className="border-y border-border/50 bg-muted/30 dark:bg-card/40">
      <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 py-5">
        <div className="flex flex-wrap items-center justify-center gap-x-14 gap-y-3">
          {signals.map((s) => (
            <div key={s.text} className="flex items-center gap-2.5 text-base font-medium text-muted-foreground">
              <s.icon className="h-5 w-5 text-primary/70" />
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
      <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 py-20 lg:py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary/70 mb-3">Neden Calon?</p>
          <h2 className="text-4xl font-bold tracking-tight xl:text-5xl">
            Salonunuzun ihtiyacı olan her şey, tek yerde
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
            Dağınık araçları bırakın. Randevudan müşteri takibine, ekipten rapora — tek sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {values.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border/70 dark:border-border/50 bg-card p-8 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <v.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">{v.title}</h3>
              <p className="text-base text-muted-foreground leading-relaxed">{v.desc}</p>
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
      accent: 'bg-blue-50 dark:bg-blue-950/50 border-blue-200/70 dark:border-blue-700/50',
      iconAccent: 'bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400',
    },
    {
      icon: Monitor,
      label: 'Salon Operasyon Paneli',
      title: 'Günlük operasyonu tek ekrandan yönetin',
      desc: 'Takvim görünümü, randevu detayları, müşteri notları, ödeme takibi — salon sahiplerinin günlük komuta merkezi.',
      features: ['Günlük/haftalık takvim', 'Personel bazlı görünüm', 'Müşteri geçmişi ve notlar', 'Ödeme ve kasa takibi'],
      accent: 'bg-purple-50 dark:bg-purple-950/50 border-purple-200/70 dark:border-purple-700/50',
      iconAccent: 'bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400',
    },
    {
      icon: Layers,
      label: 'Büyümeye Uygun İşletme Altyapısı',
      title: 'Küçük başlayın, sınırsız büyüyün',
      desc: 'Tek şubeden çoklu lokasyona, birkaç hizmetten geniş kataloğa. Altyapı sizi yavaşlatmaz — büyümenizi destekler.',
      features: ['Çoklu şube desteği', 'Hizmet ve katalog düzeni', 'Ekip ölçeklendirme', 'Platform seviyesinde kontrol'],
      accent: 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200/70 dark:border-emerald-700/50',
      iconAccent: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <section id="urun" className="bg-muted/20 dark:bg-card/30 border-y border-border/40 dark:border-border/30">
      <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 py-20 lg:py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary/70 mb-3">Ürün</p>
          <h2 className="text-4xl font-bold tracking-tight xl:text-5xl">
            Gerçek ürün, gerçek yüzeyler
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto text-lg">
            Calon bir konsept değil — çalışan, kullanılan, her gün işletmelere değer üreten bir sistem.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
          {surfaces.map((s) => (
            <div key={s.label} className={`rounded-2xl border p-8 space-y-5 ${s.accent}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.iconAccent}`}>
                <s.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">{s.label}</p>
                <h3 className="text-xl font-bold tracking-tight">{s.title}</h3>
              </div>
              <p className="text-base text-muted-foreground leading-relaxed">{s.desc}</p>
              <ul className="space-y-2.5 pt-1">
                {s.features.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-base text-foreground/80">
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
      <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 py-20 lg:py-24">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary/70 mb-3">Kimin İçin?</p>
          <h2 className="text-4xl font-bold tracking-tight xl:text-5xl">
            Her ölçekte salon için
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-7">
          {segments.map((s) => (
            <div key={s.title} className="rounded-2xl border border-border/70 dark:border-border/50 bg-card p-8 space-y-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">{s.title}</h3>
              <p className="text-base text-muted-foreground leading-relaxed">{s.desc}</p>
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
    <section className="bg-primary/5 dark:bg-primary/15 border-t border-border/40">
      <div className="mx-auto max-w-[900px] px-8 py-20 lg:py-24 text-center">
        <h2 className="text-4xl font-bold tracking-tight xl:text-5xl">
          Salonunuzu Calon'a taşıyın
        </h2>
        <p className="mt-5 text-muted-foreground max-w-xl mx-auto text-lg">
          5 dakikada kurun. Hizmetlerinizi, ekibinizi ve takviminizi ekleyin.
          Müşterileriniz hemen online randevu almaya başlasın.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="h-14 px-9 text-lg font-semibold">
            <Link href="/register">
              Demo Talep Et
              <ArrowRight className="ml-2.5 h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 px-9 text-lg font-medium">
            <a href="#urun">Ürünü İncele</a>
          </Button>
        </div>
        <p className="mt-5 text-base text-muted-foreground/60">
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
      <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-base font-bold">C</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Calon</span>
            <span className="text-sm text-muted-foreground/60">Salon Operating System</span>
          </div>
          <div className="flex items-center gap-8 text-base text-muted-foreground">
            <Link href="/login" className="hover:text-foreground transition-colors">Giriş Yap</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Kayıt Ol</Link>
          </div>
        </div>
        <div className="mt-6 pt-5 border-t border-border/30 text-center">
          <p className="text-sm text-muted-foreground/50">
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
        <div className="mx-auto max-w-[1440px] 2xl:max-w-[1520px] px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-base font-bold">C</span>
            </div>
            <span className="text-lg font-semibold tracking-tight">Calon</span>
          </div>
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" className="text-base">
              <Link href="/login">Giriş Yap</Link>
            </Button>
            <Button asChild className="text-base px-6">
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
