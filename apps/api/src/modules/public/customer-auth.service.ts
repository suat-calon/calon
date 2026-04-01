/**
 * CUSTOMER AUTH SERVICE — Customer Portal Phase 1 (Hardened)
 * ──────────────────────────────────────────────────────────────────────────────
 * Phone OTP tabanlı customer doğrulama.
 * Customer ≠ User — ayrı session mekanizması.
 * Tenant-scoped: her OTP isteği slug ile tenant'a bağlanır.
 *
 * Security:
 *   • OTP bcrypt hash ile saklanır — plaintext DB'de yok
 *   • OTP hiçbir API response'unda dönmez (dev mode dahil)
 *   • Verify sonrası OTP temizlenir
 *   • Cooldown: 60s (spam koruması)
 *   • Expiry: 5 dakika
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt    from 'bcrypt';
import { PrismaService } from '../../common/prisma.service';

const OTP_EXPIRY_MS   = 5 * 60 * 1000; // 5 dakika
const OTP_COOLDOWN_MS = 60 * 1000;     // 1 dakika — spam koruması
const OTP_HASH_ROUNDS = 6;             // Düşük round — 6 haneli kod, hız öncelikli

export interface CustomerSessionPayload {
  customerId: string;
  tenantId:   string;
  type:       'customer';
}

@Injectable()
export class CustomerAuthService {
  private readonly logger = new Logger(CustomerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt:    JwtService,
  ) {}

  /**
   * OTP oluştur, hash'le ve customer'a kaydet.
   * OTP hiçbir response'ta dönmez — SMS/email delivery Faz-2 scope.
   */
  async requestOtp(slug: string, phone: string): Promise<{ message: string }> {
    // 1. Tenant resolve
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Salon bulunamadı.');

    // 2. Customer lookup (phone + tenant)
    const customer = await this.prisma.customer.findFirst({
      where: { phone, tenantId: tenant.id, isDeleted: false },
      select: { id: true, otpExpiresAt: true },
    });
    if (!customer) {
      throw new NotFoundException('Bu telefon numarasıyla kayıtlı müşteri bulunamadı. Lütfen önce randevu alın.');
    }

    // 3. Cooldown check
    if (customer.otpExpiresAt) {
      const cooldownEnd = new Date(customer.otpExpiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS);
      if (new Date() < cooldownEnd) {
        throw new BadRequestException('Lütfen 1 dakika bekleyip tekrar deneyin.');
      }
    }

    // 4. Generate 6-digit OTP + hash
    const otpPlain = String(Math.floor(100000 + Math.random() * 900000));
    const otpCode  = await bcrypt.hash(otpPlain, OTP_HASH_ROUNDS);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { otpCode, otpExpiresAt },
    });

    this.logger.log(`OTP generated for customer=${customer.id} tenant=${tenant.id}`);

    // TODO: SMS/email gönderimi Faz-2
    // OTP hiçbir response'ta dönmez — production ve staging dahil.
    return { message: 'Doğrulama kodu gönderildi.' };
  }

  /**
   * OTP doğrula (bcrypt compare) ve session token (JWT) oluştur.
   */
  async verifyOtp(slug: string, phone: string, otpCode: string): Promise<{ token: string }> {
    // 1. Tenant resolve
    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isDeleted: false },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Salon bulunamadı.');

    // 2. Customer lookup — sadece auth alanları
    const customer = await this.prisma.customer.findFirst({
      where: { phone, tenantId: tenant.id, isDeleted: false },
      select: { id: true, otpCode: true, otpExpiresAt: true },
    });
    if (!customer) throw new NotFoundException('Müşteri bulunamadı.');

    // 3. OTP validation
    if (!customer.otpCode || !customer.otpExpiresAt) {
      throw new BadRequestException('Önce doğrulama kodu isteyiniz.');
    }
    if (new Date() > customer.otpExpiresAt) {
      throw new BadRequestException('Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.');
    }

    // bcrypt compare — hash'lenmiş OTP ile plaintext karşılaştırma
    const isValid = await bcrypt.compare(otpCode, customer.otpCode);
    if (!isValid) {
      throw new BadRequestException('Doğrulama kodu hatalı.');
    }

    // 4. Clear OTP + update lastLoginAt
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { otpCode: null, otpExpiresAt: null, lastLoginAt: new Date() },
    });

    // 5. Create customer session JWT
    const payload: CustomerSessionPayload = {
      customerId: customer.id,
      tenantId:   tenant.id,
      type:       'customer',
    };

    const token = this.jwt.sign(payload, { expiresIn: '7d' });

    this.logger.log(`Customer session created: customer=${customer.id} tenant=${tenant.id}`);
    return { token };
  }
}
