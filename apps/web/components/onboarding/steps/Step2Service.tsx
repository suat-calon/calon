'use client';

import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { useState }    from 'react';
import { Scissors }    from 'lucide-react';

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
  name:        z.string().min(2, 'Hizmet adı en az 2 karakter'),
  durationMin: z.coerce.number().int().min(5, 'En az 5 dakika'),
  price:       z.coerce.number().min(0, 'Geçerli bir fiyat girin'),
});
type FormValues = z.infer<typeof schema>;

export function Step2Service() {
  const [loading, setLoading] = useState(false);
  const store = useOnboardingStore();

  const form = useForm<FormValues>({
    resolver:      zodResolver(schema),
    defaultValues: { name: '', durationMin: 30, price: 0 },
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    try {
      const { data } = await apiClient.post<{ serviceId: string }>(
        '/onboarding/wizard/service',
        values,
      );
      store.setService(data.serviceId);
      store.setStep(3);
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
          <Scissors className="h-5 w-5 text-primary" />
          <CardTitle>İlk Hizmetinizi Ekleyin</CardTitle>
        </div>
        <CardDescription>
          Sunduğunuz bir hizmeti tanımlayın. Daha fazlasını daha sonra ekleyebilirsiniz.
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
                  <FormLabel>Hizmet Adı <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Input placeholder="Saç Kesimi" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="durationMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Süre (dakika) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" min={5} step={5} placeholder="30" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fiyat (₺) <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step={1} placeholder="250" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => store.setStep(1)}
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
