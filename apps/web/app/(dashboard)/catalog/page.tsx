'use client';

import { useState }    from 'react';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { Plus, Loader2 } from 'lucide-react';

import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { Badge }   from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';

import { useServices, useCreateService } from '@/hooks/api/use-services';
import { useProducts, useCreateProduct } from '@/hooks/api/use-products';

// ── Şemalar ───────────────────────────────────────────────────────────────────

const serviceSchema = z.object({
  categoryId:  z.string().uuid('Geçerli bir Kategori UUID girin'),
  name:        z.string().min(1, 'Ad gerekli').max(200),
  description: z.string().max(1000).optional(),
  durationMin: z.coerce.number().int().min(1, 'En az 1 dakika olmalı'),
  price:       z.coerce.number().min(0, 'Fiyat 0 veya üzeri olmalı'),
  currency:    z.string().max(3).default('TRY'),
  depositRate: z.coerce.number().min(0).max(1).optional(),
});

const productSchema = z.object({
  name:        z.string().min(1, 'Ad gerekli'),
  sku:         z.string().optional(),
  unit:        z.string().default('ml'),
  stockAmount: z.coerce.number().min(0).optional(),
  minStock:    z.coerce.number().min(0).optional(),
  costPrice:   z.coerce.number().min(0).optional(),
});

type ServiceForm = z.infer<typeof serviceSchema>;
type ProductForm = z.infer<typeof productSchema>;

// ── Ana bileşen ───────────────────────────────────────────────────────────────

export default function CatalogPage() {
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [productSheetOpen, setProductSheetOpen] = useState(false);

  const { data: services, isLoading: servicesLoading } = useServices();
  const { data: products, isLoading: productsLoading } = useProducts();

  const createService = useCreateService();
  const createProduct = useCreateProduct();

  // ── Hizmet formu ────────────────────────────────────────────────────────────
  const serviceForm = useForm<ServiceForm>({
    resolver:      zodResolver(serviceSchema),
    defaultValues: {
      categoryId: '', name: '', description: '',
      durationMin: 60, price: 0, currency: 'TRY', depositRate: 0,
    },
  });

  async function onServiceSubmit(values: ServiceForm) {
    try {
      await createService.mutateAsync({
        ...values,
        description: values.description || undefined,
        depositRate: values.depositRate ?? undefined,
      });
      toast({ title: 'Hizmet eklendi', description: `"${values.name}" başarıyla oluşturuldu.` });
      serviceForm.reset();
      setServiceSheetOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Hizmet eklenemedi.' });
    }
  }

  // ── Ürün formu ──────────────────────────────────────────────────────────────
  const productForm = useForm<ProductForm>({
    resolver:      zodResolver(productSchema),
    defaultValues: { name: '', sku: '', unit: 'ml', stockAmount: 0, minStock: 0, costPrice: 0 },
  });

  async function onProductSubmit(values: ProductForm) {
    try {
      await createProduct.mutateAsync({
        ...values,
        sku:         values.sku || undefined,
        stockAmount: values.stockAmount ?? undefined,
        minStock:    values.minStock ?? undefined,
        costPrice:   values.costPrice ?? undefined,
      });
      toast({ title: 'Ürün eklendi', description: `"${values.name}" başarıyla oluşturuldu.` });
      productForm.reset();
      setProductSheetOpen(false);
    } catch {
      toast({ variant: 'destructive', title: 'Hata', description: 'Ürün eklenemedi.' });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Üst nav */}
      <header className="border-b bg-white px-6 py-4 flex items-center gap-2 shadow-sm">
        <span className="text-xl font-bold text-primary">Auralis</span>
        <span className="text-sm text-muted-foreground">/ Katalog</span>
      </header>

      <main className="container mx-auto max-w-6xl p-6 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Katalog Yönetimi</h1>

        <Tabs defaultValue="services">
          <TabsList>
            <TabsTrigger value="services">Hizmetler</TabsTrigger>
            <TabsTrigger value="products">Ürünler</TabsTrigger>
          </TabsList>

          {/* ── HİZMETLER ─────────────────────────────────────────────────── */}
          <TabsContent value="services" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setServiceSheetOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Yeni Hizmet
              </Button>
            </div>

            {servicesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-lg border bg-white shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ad</TableHead>
                      <TableHead>Süre</TableHead>
                      <TableHead>Fiyat</TableHead>
                      <TableHead>Para Birimi</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!services || services.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Henüz hizmet eklenmemiş
                        </TableCell>
                      </TableRow>
                    ) : (
                      services.map((svc) => (
                        <TableRow key={svc.id}>
                          <TableCell className="font-medium">
                            <div>{svc.name}</div>
                            {svc.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {svc.description}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{svc.durationMin} dk</TableCell>
                          <TableCell>{Number(svc.price).toLocaleString('tr-TR')}</TableCell>
                          <TableCell>{svc.currency}</TableCell>
                          <TableCell>
                            <Badge variant={svc.isActive ? 'success' : 'secondary'}>
                              {svc.isActive ? 'Aktif' : 'Pasif'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── ÜRÜNLER ───────────────────────────────────────────────────── */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setProductSheetOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Yeni Ürün
              </Button>
            </div>

            {productsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-lg border bg-white shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ad</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Birim</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Min. Stok</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!products || products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Henüz ürün eklenmemiş
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((prd) => (
                        <TableRow key={prd.id}>
                          <TableCell className="font-medium">{prd.name}</TableCell>
                          <TableCell>{prd.sku ?? '—'}</TableCell>
                          <TableCell>{prd.unit}</TableCell>
                          <TableCell>
                            <span className={Number(prd.stockAmount) <= Number(prd.minStock) ? 'text-destructive font-semibold' : ''}>
                              {Number(prd.stockAmount).toLocaleString('tr-TR')}
                            </span>
                          </TableCell>
                          <TableCell>{Number(prd.minStock).toLocaleString('tr-TR')}</TableCell>
                          <TableCell>
                            <Badge variant={prd.isActive ? 'success' : 'secondary'}>
                              {prd.isActive ? 'Aktif' : 'Pasif'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── HİZMET SHEET ────────────────────────────────────────────────────── */}
      <Sheet open={serviceSheetOpen} onOpenChange={setServiceSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Yeni Hizmet Ekle</SheetTitle>
            <SheetDescription>Hizmet bilgilerini girin. Kategori UUID backend'den alınır.</SheetDescription>
          </SheetHeader>

          <Form {...serviceForm}>
            <form
              onSubmit={serviceForm.handleSubmit(onServiceSubmit)}
              className="space-y-4 mt-6"
            >
              <FormField control={serviceForm.control} name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategori UUID</FormLabel>
                    <FormControl><Input placeholder="550e8400-..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={serviceForm.control} name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hizmet Adı</FormLabel>
                    <FormControl><Input placeholder="Keratin Bakım" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={serviceForm.control} name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Açıklama (opsiyonel)</FormLabel>
                    <FormControl><Input placeholder="Kısa açıklama..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={serviceForm.control} name="durationMin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Süre (dk)</FormLabel>
                      <FormControl><Input type="number" min={1} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={serviceForm.control} name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fiyat</FormLabel>
                      <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={serviceForm.control} name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Para Birimi</FormLabel>
                      <FormControl><Input placeholder="TRY" maxLength={3} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={serviceForm.control} name="depositRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kaparo Oranı (0-1)</FormLabel>
                      <FormControl><Input type="number" min={0} max={1} step="0.05" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createService.isPending}
              >
                {createService.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaydediliyor…</>
                ) : (
                  'Hizmet Ekle'
                )}
              </Button>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      {/* ── ÜRÜN SHEET ──────────────────────────────────────────────────────── */}
      <Sheet open={productSheetOpen} onOpenChange={setProductSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Yeni Ürün Ekle</SheetTitle>
            <SheetDescription>Ürün bilgilerini girin.</SheetDescription>
          </SheetHeader>

          <Form {...productForm}>
            <form
              onSubmit={productForm.handleSubmit(onProductSubmit)}
              className="space-y-4 mt-6"
            >
              <FormField control={productForm.control} name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ürün Adı</FormLabel>
                    <FormControl><Input placeholder="Keratin Serum" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={productForm.control} name="sku"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SKU</FormLabel>
                      <FormControl><Input placeholder="KRT-001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={productForm.control} name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birim</FormLabel>
                      <FormControl><Input placeholder="ml" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={productForm.control} name="stockAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stok</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={productForm.control} name="minStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min. Stok</FormLabel>
                      <FormControl><Input type="number" min={0} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField control={productForm.control} name="costPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maliyet</FormLabel>
                      <FormControl><Input type="number" min={0} step="0.01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={createProduct.isPending}
              >
                {createProduct.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaydediliyor…</>
                ) : (
                  'Ürün Ekle'
                )}
              </Button>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
