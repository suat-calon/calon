import { redirect } from 'next/navigation';

/**
 * Kök URL'yi dashboard'a yönlendirir.
 * Kullanıcı giriş yapmamışsa dashboard layout'u /login'e atar.
 */
export default function HomePage() {
  redirect('/dashboard');
}
