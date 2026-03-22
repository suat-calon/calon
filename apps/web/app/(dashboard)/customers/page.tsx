'use client';

import { Users, AlertCircle } from 'lucide-react';
import { format, parseISO }   from 'date-fns';
import { tr }                 from 'date-fns/locale';

import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge }              from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useCustomers }       from '@/hooks/api/use-customers';

export default function CustomersPage() {
  const { data, isLoading, error } = useCustomers();
  const customers = data?.data ?? [];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Müşteriler</h1>
        <span className="text-sm text-muted-foreground">
          {data ? `${data.total} müşteri` : ''}
        </span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Müşteri Listesi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-center gap-2 text-destructive text-sm py-4">
              <AlertCircle className="h-4 w-4" />
              Müşteriler yüklenemedi.
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : customers.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              Henüz müşteri bulunmuyor. Booking akışından ilk randevular geldiğinde müşteriler burada görünecek.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad Soyad</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Sadakat</TableHead>
                    <TableHead>Kayıt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.firstName} {c.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.phone ?? '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.email ?? '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {c.loyaltyTier} ({c.loyaltyPoints}p)
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(parseISO(c.createdAt), 'd MMM yyyy', { locale: tr })}
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
