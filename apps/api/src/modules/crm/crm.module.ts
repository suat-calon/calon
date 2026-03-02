/**
 * CRM MODULE — Müşteri İlişkileri Yönetimi
 * ─────────────────────────────────────────────────────────────────────────────
 * İçerik:
 *   • CustomerService    — CRUD + KVKK/GDPR Silme Hakkı Motoru
 *   • ConsentFormService — Yasal Onam Formları (Immutable)
 *   • GalleryService     — Öncesi/Sonrası Fotoğraf Yönetimi (Sağlık Verisi)
 *
 * Bağımlılıklar (Global modüllerden otomatik):
 *   • PrismaService  → DatabaseModule @Global()
 *   • tenantContext  → TenantGuard tarafından yönetilir
 *
 * Güvenlik:
 *   • TenantGuard APP_GUARD olarak globaldir — tüm CRM endpoint'leri korumalı
 *   • ConsentForm: Update/Delete endpoint'i yoktur (yasal zorunluluk)
 *   • Gallery: Sağlık verisi — TenantGuard dışında ek erişim denetimi v2'de
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Module }              from '@nestjs/common';
import { CustomerController }  from './customer.controller';
import { CustomerService }     from './customer.service';
import { ConsentFormController } from './consent-form.controller';
import { ConsentFormService }  from './consent-form.service';
import { GalleryController }   from './gallery.controller';
import { GalleryService }      from './gallery.service';

@Module({
  controllers: [
    CustomerController,
    ConsentFormController,
    GalleryController,
  ],
  providers: [
    CustomerService,
    ConsentFormService,
    GalleryService,
  ],
})
export class CrmModule {}
