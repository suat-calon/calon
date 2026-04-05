'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Building2, MapPin, Phone, Globe, Copy, Check,
  ExternalLink, Link2, AlertCircle, Loader2, Save,
  Megaphone, ImageIcon, FileText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Badge }  from '@/components/ui/badge';
import { toast }  from '@/hooks/use-toast';
import { useTenant, useUpdateTenantProfile } from '@/hooks/api/use-auth';

export default function SettingsPage() {
  const { data: tenant, isLoading, error } = useTenant();
  const updateProfile = useUpdateTenantProfile();
  const [copied, setCopied] = useState(false);

  // Editable fields — profile
  const [name, setName]       = useState('');
  const [phone, setPhone]     = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity]       = useState('');

  // Editable fields — storefront
  const [description, setDescription]             = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementText, setAnnouncementText]   = useState('');
  const [announcementCta, setAnnouncementCta]     = useState('');
  const [galleryImagesRaw, setGalleryImagesRaw]   = useState('');

  // Sync form when tenant loads
  useEffect(() => {
    if (tenant) {
      setName(tenant.name ?? '');
      setPhone(tenant.location?.phone ?? '');
      setAddress(tenant.location?.address ?? '');
      setCity(tenant.location?.city ?? '');
      // Storefront
      setDescription(tenant.description ?? '');
      setAnnouncementTitle(tenant.announcementTitle ?? '');
      setAnnouncementText(tenant.announcementText ?? '');
      setAnnouncementCta(tenant.announcementCta ?? '');
      setGalleryImagesRaw((tenant.galleryImages ?? []).join('\n'));
    }
  }, [tenant]);

  const bookingUrl = tenant?.slug
    ? `${process.env.NEXT_PUBLIC_BOOKING_URL ?? 'https://book.calon.com.tr'}/${tenant.slug}`
    : null;

  const handleCopy = useCallback(async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard API might fail */ }
  }, [bookingUrl]);

  // Parse gallery URLs from newline-separated text
  const parseGalleryImages = (raw: string): string[] =>
    raw.split('\n').map((s) => s.trim()).filter(Boolean);

  const handleSave = useCallback(async () => {
    try {
      const galleryImages = parseGalleryImages(galleryImagesRaw);
      await updateProfile.mutateAsync({
        name, phone, address, city,
        description:       description || undefined,
        announcementTitle: announcementTitle || undefined,
        announcementText:  announcementText || undefined,
        announcementCta:   announcementCta || undefined,
        galleryImages:     galleryImages.length > 0 ? galleryImages : undefined,
      });
      toast({ title: 'Kaydedildi', description: 'Salon bilgileri güncellendi.' });
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Kaydetme başarısız.' });
    }
  }, [name, phone, address, city, description, announcementTitle, announcementText, announcementCta, galleryImagesRaw, updateProfile]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-8 justify-center">
        <AlertCircle className="h-5 w-5" /><span>Salon bilgileri yüklenemedi.</span>
      </div>
    );
  }

  if (isLoading || !tenant) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Salon Ayarları</h1>

      {/* ── Profile Card ──────────────────────────────────────────────────── */}
      <div className="bg-card rounded-lg border p-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">İşletme Profili</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">{tenant.plan}</Badge>
              <span className="text-xs text-muted-foreground">{tenant.currency}</span>
              <span className="text-xs text-muted-foreground">{tenant.timezone}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Salon Adı</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Salon adı" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Telefon</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XX XXX XX XX" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Şehir</label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="İstanbul" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Adres</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adres" />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={updateProfile.isPending} className="shadow-sm">
              {updateProfile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Kaydet
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              <span>Slug: {tenant.slug}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Booking Link ──────────────────────────────────────────────────── */}
      {bookingUrl && (
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border border-primary/20 shadow-sm p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/15 shrink-0">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Online Randevu Linki</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Bu linki müşterilerinizle paylaşarak online randevu almalarını sağlayın.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <code className="flex-1 text-xs bg-card/80 border rounded-md px-3 py-2 truncate font-mono">
                  {bookingUrl}
                </code>
                <Button variant="outline" size="sm" className="shrink-0 border-primary/30 text-primary hover:bg-primary/10" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" className="shrink-0" asChild>
                  <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Storefront Content ──────────────────────────────────────────── */}
      <div className="bg-card rounded-lg border p-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 rounded-xl bg-purple-100 shrink-0">
            <FileText className="h-6 w-6 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Vitrin İçeriği</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Online randevu sayfanızda müşterilerinize gösterilecek içerikler.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Salon Açıklaması</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Salonunuzu kısaca tanıtın..."
              rows={3}
              maxLength={1000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">{description.length}/1000</p>
          </div>
        </div>
      </div>

      {/* ── Announcement ─────────────────────────────────────────────────── */}
      <div className="bg-card rounded-lg border p-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 rounded-xl bg-amber-100 shrink-0">
            <Megaphone className="h-6 w-6 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Kampanya / Duyuru</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Vitrin sayfanızda gösterilecek kampanya veya duyuru banner&apos;ı.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Başlık</label>
            <Input
              value={announcementTitle}
              onChange={(e) => setAnnouncementTitle(e.target.value)}
              placeholder="Yaz kampanyası başladı!"
              maxLength={200}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Metin</label>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder="Kampanya detaylarını yazın..."
              rows={2}
              maxLength={1000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CTA Linki (opsiyonel)</label>
            <Input
              value={announcementCta}
              onChange={(e) => setAnnouncementCta(e.target.value)}
              placeholder="https://..."
              maxLength={500}
            />
          </div>
        </div>
      </div>

      {/* ── Gallery ──────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-lg border p-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 rounded-xl bg-emerald-100 shrink-0">
            <ImageIcon className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Galeri</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Her satıra bir görsel URL&apos;si yapıştırın. Vitrin sayfanızda gösterilecektir.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Görsel URL&apos;leri (satır başı bir URL)</label>
            <textarea
              value={galleryImagesRaw}
              onChange={(e) => setGalleryImagesRaw(e.target.value)}
              placeholder={"https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg"}
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {parseGalleryImages(galleryImagesRaw).length} görsel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
