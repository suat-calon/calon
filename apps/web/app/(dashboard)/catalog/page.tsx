'use client';

import { useState, useMemo } from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import {
  Plus, Loader2, Search, Pencil, Trash2, AlertCircle,
  Scissors, Package, ToggleLeft, ToggleRight,
} from 'lucide-react';

import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
// Tabs UI implemented as plain buttons for reliable state control
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';

import {
  useServices, useCreateService, useUpdateService, useDeleteService,
  type Service, type CreateServicePayload,
} from '@/hooks/api/use-services';
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  type Product, type CreateProductPayload,
} from '@/hooks/api/use-products';

// ── Schemas ────────────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  name:        z.string().min(1, 'Ad gerekli').max(200),
  description: z.string().max(1000).optional(),
  durationMin: z.coerce.number().int().min(1, 'En az 1 dk'),
  price:       z.coerce.number().min(0, 'Fiyat 0+'),
  currency:    z.string().max(3).default('TRY'),
  depositRate: z.coerce.number().min(0).max(1).optional(),
});

const productSchema = z.object({
  name:        z.string().min(1, 'Ad gerekli'),
  sku:         z.string().optional(),
  unit:        z.string().default('adet'),
  stockAmount: z.coerce.number().min(0).optional(),
  minStock:    z.coerce.number().min(0).optional(),
  costPrice:   z.coerce.number().min(0).optional(),
});

type ServiceForm = z.infer<typeof serviceSchema>;
type ProductForm = z.infer<typeof productSchema>;

// ── Main ───────────────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab]       = useState('services');

  // Service state
  const [svcSheetOpen, setSvcSheetOpen]   = useState(false);
  const [editingSvc, setEditingSvc]       = useState<Service | null>(null);
  const [deletingSvc, setDeletingSvc]     = useState<Service | null>(null);

  // Product state
  const [prodSheetOpen, setProdSheetOpen] = useState(false);
  const [editingProd, setEditingProd]     = useState<Product | null>(null);
  const [deletingProd, setDeletingProd]   = useState<Product | null>(null);

  // Data
  const { data: services, isLoading: svcLoading, error: svcError } = useServices();
  const { data: products, isLoading: prodLoading, error: prodError } = useProducts();
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  // Filtered
  const q = search.toLowerCase();
  const filteredServices = useMemo(() =>
    (services ?? []).filter((s) => !s.isDeleted && s.name.toLowerCase().includes(q)),
  [services, q]);
  const filteredProducts = useMemo(() =>
    (products ?? []).filter((p) => !p.isDeleted && (p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))),
  [products, q]);

  // ── Service form ───────────────────────────────────────────────────────────
  const svcForm = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: '', description: '', durationMin: 30, price: 0, currency: 'TRY', depositRate: 0 },
  });

  function openCreateService() {
    setEditingSvc(null);
    svcForm.reset({ name: '', description: '', durationMin: 30, price: 0, currency: 'TRY', depositRate: 0 });
    setSvcSheetOpen(true);
  }

  function openEditService(svc: Service) {
    setEditingSvc(svc);
    svcForm.reset({
      name: svc.name, description: svc.description ?? '',
      durationMin: svc.durationMin, price: Number(svc.price), currency: svc.currency, depositRate: Number(svc.depositRate),
    });
    setSvcSheetOpen(true);
  }

  async function onServiceSubmit(values: ServiceForm) {
    try {
      if (editingSvc) {
        await updateService.mutateAsync({ id: editingSvc.id, name: values.name, description: values.description, durationMin: values.durationMin, price: values.price, depositRate: values.depositRate });
        toast({ title: 'Hizmet güncellendi', description: `${values.name} kaydedildi.` });
      } else {
        // Derive categoryId from existing services or use first known category
        const existingCatId = (services ?? []).find((s) => s.categoryId)?.categoryId;
        const categoryId = existingCatId ?? '00000000-0000-4000-a000-000000000020';
        await createService.mutateAsync({ ...values, categoryId });
        toast({ title: 'Hizmet oluşturuldu', description: `${values.name} eklendi.` });
      }
      setSvcSheetOpen(false);
      svcForm.reset();
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'İşlem başarısız.' });
    }
  }

  async function onDeleteService() {
    if (!deletingSvc) return;
    try {
      await deleteService.mutateAsync(deletingSvc.id);
      toast({ title: 'Silindi', description: `${deletingSvc.name} silindi.` });
      setDeletingSvc(null);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Silinemedi.' });
    }
  }

  async function toggleServiceActive(svc: Service) {
    try {
      await updateService.mutateAsync({ id: svc.id, isActive: !svc.isActive });
      toast({ title: svc.isActive ? 'Pasife alındı' : 'Aktifleştirildi', description: svc.name });
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Durum değiştirilemedi.' });
    }
  }

  // ── Product form ───────────────────────────────────────────────────────────
  const prodForm = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', sku: '', unit: 'adet', stockAmount: 0, minStock: 0, costPrice: 0 },
  });

  function openCreateProduct() {
    setEditingProd(null);
    prodForm.reset({ name: '', sku: '', unit: 'adet', stockAmount: 0, minStock: 0, costPrice: 0 });
    setProdSheetOpen(true);
  }

  function openEditProduct(prod: Product) {
    setEditingProd(prod);
    prodForm.reset({
      name: prod.name, sku: prod.sku ?? '', unit: prod.unit,
      stockAmount: Number(prod.stockAmount), minStock: Number(prod.minStock), costPrice: Number(prod.costPrice),
    });
    setProdSheetOpen(true);
  }

  async function onProductSubmit(values: ProductForm) {
    try {
      if (editingProd) {
        await updateProduct.mutateAsync({ id: editingProd.id, ...values });
        toast({ title: 'Ürün güncellendi', description: `${values.name} kaydedildi.` });
      } else {
        await createProduct.mutateAsync(values);
        toast({ title: 'Ürün oluşturuldu', description: `${values.name} eklendi.` });
      }
      setProdSheetOpen(false);
      prodForm.reset();
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'İşlem başarısız.' });
    }
  }

  async function onDeleteProduct() {
    if (!deletingProd) return;
    try {
      await deleteProduct.mutateAsync(deletingProd.id);
      toast({ title: 'Silindi', description: `${deletingProd.name} silindi.` });
      setDeletingProd(null);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Silinemedi.' });
    }
  }

  async function toggleProductActive(prod: Product) {
    try {
      await updateProduct.mutateAsync({ id: prod.id, isActive: !prod.isActive });
      toast({ title: prod.isActive ? 'Pasife alındı' : 'Aktifleştirildi', description: prod.name });
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Durum değiştirilemedi.' });
    }
  }

  const isLoading = tab === 'services' ? svcLoading : prodLoading;
  const hasError  = tab === 'services' ? svcError : prodError;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Katalog</h1>
        <Button size="sm" className="shadow-sm" onClick={tab === 'services' ? openCreateService : openCreateProduct}>
          <Plus className="mr-1 h-4 w-4" />
          {tab === 'services' ? 'Yeni Hizmet' : 'Yeni Ürün'}
        </Button>
      </div>

      {/* Search + Tabs */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Ara..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex rounded-lg border bg-muted p-0.5 h-9">
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors ${tab === 'services' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setTab('services')}
          >
            <Scissors className="h-3.5 w-3.5" />Hizmetler
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors ${tab === 'products' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setTab('products')}
          >
            <Package className="h-3.5 w-3.5" />Ürünler
          </button>
        </div>
      </div>

      {/* List */}
      {hasError ? (
        <div className="flex items-center gap-2 text-destructive py-8 justify-center">
          <AlertCircle className="h-5 w-5" /><span>Yüklenemedi. Lütfen sayfayı yenileyin.</span>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tab === 'services' ? (
        filteredServices.length === 0 ? (
          <EmptyState icon={Scissors} message={search ? 'Arama sonucu bulunamadı.' : 'Henüz hizmet eklenmemiş.'} action={!search ? openCreateService : undefined} />
        ) : (
          <div className="space-y-2">
            {filteredServices.map((svc) => (
              <div key={svc.id} className="bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-4 hover:shadow-md transition-shadow group">
                <div className="p-2 rounded-lg bg-primary/8">
                  <Scissors className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{svc.name}</span>
                    <Badge variant={svc.isActive ? 'success' : 'secondary'} className="text-[9px] px-1.5 py-0">
                      {svc.isActive ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {svc.durationMin} dk &middot; {Number(svc.price).toLocaleString('tr-TR')} ₺
                    {svc.description && <span className="ml-2 italic">{svc.description}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleServiceActive(svc)} title={svc.isActive ? 'Pasife al' : 'Aktifleştir'}>
                    {svc.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditService(svc)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingSvc(svc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        filteredProducts.length === 0 ? (
          <EmptyState icon={Package} message={search ? 'Arama sonucu bulunamadı.' : 'Henüz ürün eklenmemiş.'} action={!search ? openCreateProduct : undefined} />
        ) : (
          <div className="space-y-2">
            {filteredProducts.map((prod) => {
              const stock    = Number(prod.stockAmount);
              const minStock = Number(prod.minStock);
              const lowStock = stock <= minStock && minStock > 0;
              return (
                <div key={prod.id} className="bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-4 hover:shadow-md transition-shadow group">
                  <div className="p-2 rounded-lg bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{prod.name}</span>
                      {prod.sku && <span className="text-[10px] text-muted-foreground font-mono">{prod.sku}</span>}
                      <Badge variant={prod.isActive ? 'success' : 'secondary'} className="text-[9px] px-1.5 py-0">
                        {prod.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                      {lowStock && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Düşük Stok</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Stok: {stock} {prod.unit} &middot; Min: {minStock} &middot; Maliyet: {Number(prod.costPrice).toLocaleString('tr-TR')} ₺
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleProductActive(prod)} title={prod.isActive ? 'Pasife al' : 'Aktifleştir'}>
                      {prod.isActive ? <ToggleRight className="h-4 w-4 text-emerald-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditProduct(prod)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeletingProd(prod)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── SERVICE SHEET ─────────────────────────────────────────────────── */}
      <Sheet open={svcSheetOpen} onOpenChange={setSvcSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingSvc ? 'Hizmeti Düzenle' : 'Yeni Hizmet'}</SheetTitle>
            <SheetDescription>{editingSvc ? editingSvc.name : 'Kataloğa hizmet ekleyin.'}</SheetDescription>
          </SheetHeader>
          <Form {...svcForm}>
            <form onSubmit={svcForm.handleSubmit(onServiceSubmit)} className="mt-6 space-y-4">
              <FormField control={svcForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Hizmet Adı</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={svcForm.control} name="durationMin" render={({ field }) => (
                  <FormItem><FormLabel>Süre (dk)</FormLabel><FormControl><Input type="number" min={1} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={svcForm.control} name="price" render={({ field }) => (
                  <FormItem><FormLabel>Fiyat (₺)</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={svcForm.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>Açıklama (opsiyonel)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              {/* categoryId auto-derived from existing services — no UUID input needed */}
              <Button type="submit" className="w-full" disabled={createService.isPending || updateService.isPending}>
                {(createService.isPending || updateService.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingSvc ? 'Kaydet' : 'Hizmet Ekle'}
              </Button>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* ── PRODUCT SHEET ─────────────────────────────────────────────────── */}
      <Sheet open={prodSheetOpen} onOpenChange={setProdSheetOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingProd ? 'Ürünü Düzenle' : 'Yeni Ürün'}</SheetTitle>
            <SheetDescription>{editingProd ? editingProd.name : 'Kataloğa ürün ekleyin.'}</SheetDescription>
          </SheetHeader>
          <Form {...prodForm}>
            <form onSubmit={prodForm.handleSubmit(onProductSubmit)} className="mt-6 space-y-4">
              <FormField control={prodForm.control} name="name" render={({ field }) => (
                <FormItem><FormLabel>Ürün Adı</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={prodForm.control} name="sku" render={({ field }) => (
                  <FormItem><FormLabel>SKU</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={prodForm.control} name="unit" render={({ field }) => (
                  <FormItem><FormLabel>Birim</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={prodForm.control} name="stockAmount" render={({ field }) => (
                  <FormItem><FormLabel>Stok</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={prodForm.control} name="minStock" render={({ field }) => (
                  <FormItem><FormLabel>Min Stok</FormLabel><FormControl><Input type="number" min={0} {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={prodForm.control} name="costPrice" render={({ field }) => (
                  <FormItem><FormLabel>Maliyet (₺)</FormLabel><FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <Button type="submit" className="w-full" disabled={createProduct.isPending || updateProduct.isPending}>
                {(createProduct.isPending || updateProduct.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingProd ? 'Kaydet' : 'Ürün Ekle'}
              </Button>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* ── DELETE CONFIRM ─────────────────────────────────────────────────── */}
      <Dialog open={!!(deletingSvc || deletingProd)} onOpenChange={(open) => { if (!open) { setDeletingSvc(null); setDeletingProd(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Silmek istediğinize emin misiniz?</DialogTitle>
            <DialogDescription>
              &ldquo;{deletingSvc?.name ?? deletingProd?.name}&rdquo; kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => { setDeletingSvc(null); setDeletingProd(null); }}>
              Vazgeç
            </Button>
            <Button variant="destructive" size="sm" disabled={deleteService.isPending || deleteProduct.isPending}
              onClick={deletingSvc ? onDeleteService : onDeleteProduct}
            >
              {(deleteService.isPending || deleteProduct.isPending) ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────────────────────── */

function EmptyState({
  icon: Icon, message, action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  message: string;
  action?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-3 rounded-xl bg-muted mb-3">
        <Icon className="h-6 w-6 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground mb-3">{message}</p>
      {action && (
        <Button size="sm" variant="outline" onClick={action}>
          <Plus className="mr-1 h-3.5 w-3.5" />İlk kaydı ekle
        </Button>
      )}
    </div>
  );
}
