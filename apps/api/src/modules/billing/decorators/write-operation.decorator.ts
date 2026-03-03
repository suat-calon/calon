import { SetMetadata } from '@nestjs/common';

export const WRITE_OPERATION_KEY = 'writeOperation';

/**
 * @WriteOperation() — Bu endpoint veri değiştiren (mutation) bir operasyondur.
 *
 * BillingGuard Semantik Güvenlik Katmanı:
 *   PAST_DUE tenant'ta, @WriteOperation() işaretli endpoint'ler bloklanır → 402.
 *   HTTP metoduna (POST/PUT vs.) değil, anlamsal niyete bakılır.
 *
 * Zorunlu kullanım yerleri:
 *   - Randevu oluşturma / güncelleme (AppointmentController)
 *   - Sadakat puanı harcama (LoyaltyController)
 *   - Ürün / hizmet oluşturma (CatalogController)
 *   - Personel oluşturma / vardiya (StaffController)
 *   - Müşteri oluşturma / GDPR silme (CustomerController)
 *   - Ödeme / checkout (PaymentController)
 *
 * KULLANILMAZ:
 *   - GET (okuma)
 *   - POST (arama, filtre, v.b. saf okuma operasyonları)
 *   - IAM / Auth endpoint'leri (zaten @Public() kapsamındadır)
 *   - Admin billing endpoint'leri (@AllowPastDue() zaten mevcut)
 *
 * @example
 * @WriteOperation()
 * @Post()
 * createAppointment(...) { ... }
 */
export const WriteOperation = () => SetMetadata(WRITE_OPERATION_KEY, true);
