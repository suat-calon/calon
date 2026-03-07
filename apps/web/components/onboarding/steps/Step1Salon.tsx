'use client';

import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { useState }    from 'react';
import { MapPin }      from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast }                 from '@/hooks/use-toast';
import apiClient                 from '@/lib/api-client';
import { useOnboardingStore }    from '@/stores/onboarding.store';

const schema = z.object({
  name:    z.string().min(2, 'Salon adı en az 2 karakter'),
  city:    z.string().min(2, 'Şehir gerekli'),
  phone:   z.string().min(10, 'Geçerli bir telefon numarası girin'),
  address: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function Step1Salon() {
  const [loading, setLoading] = useState(false);
  const store = useOnboardingStore();

  const form = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { name: '', city: '', phone: '', address: '' },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const { data } = await apiClient.post<{ locationId: string }>(
        '/onboarding/wizard/location',
        values,
      );
      store.setLocation(data.locationId);
      store.setStep(2);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message ?? 'Bir hata oluştu';
      toast({ variant: 'destructive', title: 'Hata', description: msg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <CardTitle>Salon Bilgileri</CardTitle>
        </div>
        <CardDescription>
          Salonunuzun temel bilgilerini girin. Bunlar booking sayfanızda görünecek.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Salon Adı <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Luna Salon" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Şehir <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Ankara" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="0312 000 00 00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adres <span className="text-muted-foreground text-xs">(opsiyonel)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Kızılay Mah. Atatürk Bulvarı No:1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Kaydediliyor…' : 'Devam Et →'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
