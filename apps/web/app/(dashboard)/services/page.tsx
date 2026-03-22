'use client';

import { AlertCircle, Scissors } from 'lucide-react';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge }      from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useServices } from '@/hooks/api/use-services';

export default function ServicesPage() {
  const { data: services, isLoading, error } = useServices();

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold tracking-tight">Hizmetler</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Hizmet Listesi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-center gap-2 text-destructive text-sm py-4">
              <AlertCircle className="h-4 w-4" />
              Hizmetler yüklenemedi.
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !services || services.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              Henüz hizmet bulunmuyor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hizmet Adı</TableHead>
                    <TableHead>Süre</TableHead>
                    <TableHead>Fiyat</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((svc) => (
                    <TableRow key={svc.id}>
                      <TableCell className="font-medium">{svc.name}</TableCell>
                      <TableCell className="text-muted-foreground">{svc.durationMin} dk</TableCell>
                      <TableCell>{Number(svc.price).toLocaleString('tr-TR')} ₺</TableCell>
                      <TableCell>
                        <Badge variant={svc.isActive ? 'success' : 'secondary'} className="text-xs">
                          {svc.isActive ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
