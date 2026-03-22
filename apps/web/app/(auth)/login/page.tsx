'use client';

import { useState }     from 'react';
import { useRouter }    from 'next/navigation';
import Link             from 'next/link';
import axios            from 'axios';
import { useForm }      from 'react-hook-form';
import { zodResolver }  from '@hookform/resolvers/zod';
import { z }            from 'zod';

import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
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

// ── Zod şeması ────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email:    z.string().email('Geçerli bir e-posta girin'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ── Bileşen ───────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router    = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver:      zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues) {
    setLoading(true);
    try {
      // Raw axios — apiClient interceptor'u bypass edilir (401 döngüsünü önler)
      // withCredentials: true → HttpOnly calon_access / calon_refresh cookie'leri alır
      await axios.post('/api/v1/auth/login', values, { withCredentials: true });

      router.push('/calendar');
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message ?? 'Giriş başarısız'
          : 'Beklenmeyen bir hata oluştu';

      toast({ variant: 'destructive', title: 'Giriş başarısız', description: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Calon'a Giriş Yap</CardTitle>
        <CardDescription>E-posta ve şifrenizle oturum açın</CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-posta</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="ornek@salon.com"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Şifre</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </Button>
          </form>
        </Form>
      </CardContent>

      <CardFooter className="flex justify-center">
        <p className="text-sm text-muted-foreground">
          Hesabınız yok mu?{' '}
          <Link href="/register" className="text-primary underline-offset-4 hover:underline font-medium">
            Kayıt Ol
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
