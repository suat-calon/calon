'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Loader2, Search, Pencil, Trash2, AlertCircle,
  Scissors, ToggleLeft, ToggleRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Badge }  from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';
import {
  useServices, useCreateService, useUpdateService, useDeleteService,
  type Service,
} from '@/hooks/api/use-services';

const serviceSchema = z.object({
  name:        z.string().min(1, 'Ad gerekli').max(200),
  description: z.string().max(1000).optional(),
  durationMin: z.coerce.number().int().min(1, 'En az 1 dk'),
  price:       z.coerce.number().min(0, 'Fiyat 0+'),
});

type ServiceForm = z.infer<typeof serviceSchema>;

export default function ServicesPage() {
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  const { data: services, isLoading, error } = useServices();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const q = search.toLowerCase();
  const filtered = useMemo(() =>
    (services ?? []).filter((s) => !s.isDeleted && s.name.toLowerCase().includes(q)),
  [services, q]);

  const form = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: '', description: '', durationMin: 30, price: 0 },
  });

  function openCreate() {
    setEditing(null);
    form.reset({ name: '', description: '', durationMin: 30, price: 0 });
    setSheetOpen(true);
  }

  function openEdit(svc: Service) {
    setEditing(svc);
    form.reset({ name: svc.name, description: svc.description ?? '', durationMin: svc.durationMin, price: Number(svc.price) });
    setSheetOpen(true);
  }

  async function onSubmit(values: ServiceForm) {
    try {
      if (editing) {
        await updateService.mutateAsync({ id: editing.id, ...values });
        toast({ title: 'Güncellendi', description: `${values.name} kaydedildi.` });
      } else {
        const existingCatId = (services ?? []).find((s) => s.categoryId)?.categoryId;
        await createService.mutateAsync({ ...values, categoryId: existingCatId ?? '00000000-0000-4000-a000-000000000020', currency: 'TRY' });
        toast({ title: 'Oluşturuldu', description: `${values.name} eklendi.` });
      }
      setSheetOpen(false);
      form.reset();
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'İşlem başarısız.' });
    }
  }

  async function onDelete() {
    if (!deleting) return;
    try {
      await deleteService.mutateAsync(deleting.id);
      toast({ title: 'Silindi', description: `${deleting.name} kaldırıldı.` });
      setDeleting(null);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Silinemedi.' });
    }
  }

  async function toggleActive(svc: Service) {
    try {
      await updateService.mutateAsync({ id: svc.id, isActive: !svc.isActive });
      toast({ title: svc.isActive ? 'Pasife alındı' : 'Aktifleştirildi', description: svc.name });
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Durum değiştirilemedi.' });
    }
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Hizmetler</h1>
        <Button size="sm" className="shadow-sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />Yeni Hizmet
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Hizmet ara..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>Yüklenemedi.</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-3 rounded-xl bg-muted mb-3"><Scissors className="h-6 w-6 text-muted-foreground/50" /></div>
          <p className="text-sm text-muted-foreground">{search ? 'Arama sonucu bulunamadı.' : 'Henüz hizmet eklenmemiş.'}</p>
          {!search && <Button size="sm" variant="outline" className="mt-3" onClick={openCreate}><Plus className="mr-1 h-3.5 w-3.5" />İlk hizmeti ekle</Button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((svc) => (
            <div key={svc.id} className="bg-card rounded-lg border px-3.5 py-2.5 flex items-center gap-4 hover:shadow-md transition-shadow group">
              <div className="p-2 rounded-lg bg-primary/8"><Scissors className="h-4 w-4 text-primary" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold truncate">{svc.name}</span>
                  <Badge variant={svc.isActive ? 'success' : 'secondary'} className="text-[9px] px-1.5 py-0">{svc.isActive ? 'Aktif' : 'Pasif'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{svc.durationMin} dk · {Number(svc.price).toLocaleString('tr-TR')} ₺</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(svc)}>
                  {svc.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(svc)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(svc)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? 'Hizmeti Düzenle' : 'Yeni Hizmet'}</SheetTitle>
            <SheetDescription>{editing ? editing.name : 'Hizmet ekleyin.'}</SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Hizmet Adı</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="durationMin" render={({ field }) => (
                  <FormItem><FormLabel>Süre (dk)</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="price" render={({ field }) => (
                  <FormItem><FormLabel>Fiyat (₺)</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Açıklama</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={createService.isPending || updateService.isPending}>
                {(createService.isPending || updateService.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? 'Kaydet' : 'Hizmet Ekle'}
              </Button>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Dialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Silmek istediğinize emin misiniz?</DialogTitle>
            <DialogDescription>&ldquo;{deleting?.name}&rdquo; kalıcı olarak silinecek.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>Vazgeç</Button>
            <Button variant="destructive" size="sm" disabled={deleteService.isPending} onClick={onDelete}>
              {deleteService.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
