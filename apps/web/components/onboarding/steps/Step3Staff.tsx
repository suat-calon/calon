'use client';

import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { useState }    from 'react';
import { User }        from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { toast }              from '@/hooks/use-toast';
import apiClient              from '@/lib/api-client';
import { useOnboardingStore } from '@/stores/onboarding.store';

const schema = z.object({
  firstName: z.string().min(1, 'Ad gerekli'),
  lastName:  z.string().min(1, 'Soyad gerekli'),
  title:     z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export function Step3Staff() {
  const [loading, setLoading] = useState(false);
  const store = useOnboardingStore();

  const form = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', title: '' },
  });

  async function onSubmit(values: FormValues) {
    if (!store.locationId) {
      toast({ variant: 'destructive', title: 'Hata', description: 'Önce salon bilgilerini tamamlayın.' });
      store.setStep(1);
      return;
    }

    setLoading(true);
    try {
      const { data } = await apiClient.post<{ staffId: string }>(
        '/onboarding/wizard/staff',
        { ...values, locationId: store.locationId },
      );
      store.setStaff(data.staffId);
      store.setStep(4);
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
          <User className="h-5 w-5 text-primary" />
          <CardTitle>İlk Personelinizi Ekleyin</CardTitle>
        </div>
        <CardDescription>
          Randevu alacak bir personel tanımlayın. Çalışma saatlerini daha sonra ayarlayabilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ad <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Fatma" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Soyad <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Demir" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unvan <span className="text-muted-foreground text-xs">(opsiyonel)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Saç Uzmanı" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => store.setStep(2)}
              >
                ← Geri
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? 'Kaydediliyor…' : 'Devam Et →'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
