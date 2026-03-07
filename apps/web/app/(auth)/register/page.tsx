'use client';

import { useState }    from 'react';
import { useRouter }   from 'next/navigation';
import Link            from 'next/link';
import axios           from 'axios';
import { useForm }     from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z }           from 'zod';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { toast } from '@/hooks/use-toast';
import { useOnboardingStore } from '@/stores/onboarding.store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Zod şeması ────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  firstName:  z.string().min(1, 'Ad gerekli'),
  lastName:   z.string().min(1, 'Soyad gerekli'),
  email:      z.string().email('Geçerli bir e-posta girin'),
  password:   z.string().min(8, 'Şifre en az 8 karakter olmalı'),
  tenantName: z.string().min(2, 'İşletme adı en az 2 karakter olmalı'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

// ── Bileşen ───────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const { setTenant, setSession, reset } = useOnboardingStore();

  const form = useForm<RegisterFormValues>({
    resolver:      zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', tenantName: '' },
  });

  async function onSubmit(values: RegisterFormValues) {
    setLoading(true);
    try {
      reset(); // Önceki oturumu temizle

      const response = await axios.post<{
        tenantId:    string;
        tenantSlug?: string;
        bookingLink: string;
      }>(
        `${BASE_URL}/api/v1/onboarding/register`,
        {
          email:     values.email,
          password:  values.password,
          firstName: values.firstName,
          lastName:  values.lastName,
          tenant: { name: values.tenantName },
        },
        { withCredentials: true },
      );

      const { tenantId, bookingLink } = response.data;
      const slug = bookingLink.split('/').pop() ?? '';

      setTenant(tenantId, slug, bookingLink);
      setSession(crypto.randomUUID());

      router.push('/onboarding');
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message ?? 'Kayıt başarısız'
          : 'Beklenmeyen bir hata oluştu';

      toast({ variant: 'destructive', title: 'Kayıt başarısız', description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Hesap Oluştur</CardTitle>
        <CardDescription>İşletmeniz için Calon hesabı açın — 5 dakikada hazır</CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Ad / Soyad */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ad</FormLabel>
                    <FormControl>
                      <Input placeholder="Ayşe" autoComplete="given-name" {...field} />
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
                    <FormLabel>Soyad</FormLabel>
                    <FormControl>
                      <Input placeholder="Yılmaz" autoComplete="family-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* E-posta */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-posta</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ornek@salon.com" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Şifre */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Şifre</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="En az 8 karakter" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* İşletme adı */}
            <FormField
              control={form.control}
              name="tenantName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>İşletme Adı</FormLabel>
                  <FormControl>
                    <Input placeholder="Luna Salon" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Hesap oluşturuluyor…' : 'Hesabı Oluştur & Devam Et'}
            </Button>
          </form>
        </Form>
      </CardContent>

      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          Zaten hesabınız var mı?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline font-medium">
            Giriş Yap
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
