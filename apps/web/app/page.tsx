import { redirect } from 'next/navigation';

/**
 * Kök URL'yi calendar'a yönlendirir.
 * Calendar, salon sahibinin birincil çalışma yüzeyidir.
 * Kullanıcı giriş yapmamışsa dashboard layout'u /login'e atar.
 */
export default function HomePage() {
  redirect('/calendar');
}
