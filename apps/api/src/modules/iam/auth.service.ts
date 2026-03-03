/**
 * AUTH SERVICE — KİMLİK DOĞRULAMA VE TOKEN YÖNETİMİ
 * ──────────────────────────────────────────────────────────────────────────────
 * Silent Refresh Mimarisi:
 *   - Access Token  : 15 dk ömürlü, stateless JWT (userId + tenantId + role)
 *   - Refresh Token : 30 gün ömürlü, opaque (rastgele hex), veritabanında saklanır
 *
 * Token Rotation Güvenlik Kalkanı:
 *   Her /auth/refresh çağrısında:
 *     1. Eski token revokedAt ile iptal edilir
 *     2. Yeni token üretilir
 *   Eğer iptal edilmiş token ile istek gelirse → Token Çalınma Tespiti:
 *     → O kullanıcının TÜM oturumları anında kapatılır
 * ──────────────────────────────────────────────────────────────────────────────
 */

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService }   from '@nestjs/jwt';
import { Prisma }       from '@prisma/client';
import * as bcrypt      from 'bcrypt';
import * as crypto      from 'crypto';
import { PrismaService }   from '../../common/prisma.service';
import { JwtPayload }      from './guards/tenant.guard';
import { RegisterDto }     from './dto/register.dto';
import { LoginDto }        from './dto/login.dto';
import { BillingService }  from '../billing/billing.service';

export interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
  /** Access token ömrü saniye cinsinden */
  expiresIn:    number;
}

const BCRYPT_ROUNDS    = 12;
const REFRESH_TTL_DAYS = 30;
const ACCESS_TTL_SEC   = 15 * 60; // 900 saniye

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly jwt:      JwtService,
    private readonly billing:  BillingService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // KAYIT — Yeni tenant + kullanıcı oluşturma
  // ═══════════════════════════════════════════════════════════════════════════
  async register(dto: RegisterDto): Promise<AuthTokens> {
    // ── 1. E-posta benzersizliği kontrolü ───────────────────────────────────
    // findUnique: soft-delete middleware bypass edilmez, silindi mi diye manuel kontrol
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existingUser) {
      // Soft-delete edilmiş kullanıcı da bloke edilir: KVKK gereği veri korunur
      throw new ConflictException('Bu e-posta adresi zaten kayıtlı.');
    }

    // ── 2. Tenant slug benzersizliği kontrolü ────────────────────────────────
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictException('Bu işletme adresi (slug) zaten alınmış.');
    }

    // ── 3. Şifre hash (bcrypt, 12 tur) ──────────────────────────────────────
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // ── 4. Atomik kayıt: Tenant + User + UserTenant ──────────────────────────
    const { user, tenant } = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const tenant = await tx.tenant.create({
        data: {
          name:   dto.tenantName,
          slug:   dto.tenantSlug,
          plan:   'SOLO',      // Başlangıç planı
          status: 'ACTIVE',    // Deneme süreci aktif
        },
      });

      const user = await tx.user.create({
        data: {
          email:        dto.email,
          passwordHash,
          firstName:    dto.firstName,
          lastName:     dto.lastName,
          status:       'ACTIVE',
          tenants: {
            create: {
              tenantId: tenant.id,
              role:     'TENANT_OWNER',  // İlk kullanıcı her zaman OWNER
            },
          },
        },
      });

      return { user, tenant };
    });

    // ── 5. TenantBilling: TRIAL başlat (transaction dışı — kendi try/catch) ─
    // Not: transaction dışında çağrılır çünkü BillingService bağımlılığı
    // zaten Prisma üzerinden atomik yazım yapar.
    try {
      await this.billing.initTrial(tenant.id);
    } catch (err) {
      // TenantBilling zaten varsa (idempotent register denemesi) sessizce geç
      this.logger.warn(`[Auth] initTrial warning: ${String(err)}`);
    }

    this.logger.log(
      `Yeni kayıt: tenant=${tenant.slug} (${tenant.id}) | user=${user.email} (${user.id})`,
    );

    return this.generateTokenPair(user.id, tenant.id, 'TENANT_OWNER', tenant.plan);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GİRİŞ — Kimlik doğrulama ve token üretimi
  // ═══════════════════════════════════════════════════════════════════════════
  async login(dto: LoginDto): Promise<AuthTokens> {
    // ── 1. Kullanıcıyı bul ──────────────────────────────────────────────────
    // Genel hata mesajı: hangi alanın yanlış olduğunu saldırgana ifşa etme
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.isDeleted || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    // ── 2. Şifre doğrulama ──────────────────────────────────────────────────
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    // ── 3. Tenant üyeliği + plan kontrolü ───────────────────────────────────
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        // Prisma @unique([userId, tenantId]) için bileşik anahtar
        userId_tenantId: { userId: user.id, tenantId: dto.tenantId },
      },
      include: { tenant: { select: { plan: true } } },
    });

    if (!userTenant) {
      throw new UnauthorizedException('Bu işletmeye erişim yetkiniz yok.');
    }

    // ── 4. Son giriş zamanı güncelleme ──────────────────────────────────────
    await this.prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    });

    this.logger.log(
      `Giriş: user=${user.email} | tenant=${dto.tenantId} | rol=${userTenant.role} | plan=${userTenant.tenant.plan}`,
    );

    return this.generateTokenPair(user.id, dto.tenantId, userTenant.role, userTenant.tenant.plan);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN YENİLEME — Silent Refresh + Token Rotation
  // ═══════════════════════════════════════════════════════════════════════════
  async refresh(incomingToken: string): Promise<AuthTokens> {
    // ── 1. Token kaydını bul ─────────────────────────────────────────────────
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: incomingToken },
    });

    if (!record) {
      throw new UnauthorizedException('Geçersiz refresh token.');
    }

    // ╔═══════════════════════════════════════════════════════════════════════╗
    // ║  TOKEN REUSE TESPİTİ — GÜVENLİK KRİTİK                             ║
    // ║                                                                       ║
    // ║  revokedAt dolu ama token ile istek geldi:                            ║
    // ║  → Daha önce kullanılmış token tekrar gönderildi                      ║
    // ║  → Senaryo: Token çalınmış, eski sahibi hâlâ retry ediyor             ║
    // ║                                                                       ║
    // ║  ÇÖZÜM: Bu kullanıcının tenant'taki TÜM aktif oturumlarını kapat     ║
    // ╚═══════════════════════════════════════════════════════════════════════╝
    if (record.revokedAt !== null) {
      this.logger.warn(
        `[GÜVENLİK] Token Reuse Tespiti! ` +
        `userId=${record.userId} tenantId=${record.tenantId}. ` +
        `Tüm aktif oturumlar kapatılıyor.`,
      );

      // Bu tenant için tüm aktif (revokedAt null) oturumları iptal et
      await this.prisma.refreshToken.updateMany({
        where: {
          userId:    record.userId,
          tenantId:  record.tenantId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      throw new UnauthorizedException(
        'Güvenlik ihlali tespit edildi. Tüm oturumlar sonlandırıldı. ' +
        'Lütfen tekrar giriş yapın.',
      );
    }

    // ── 2. Token süre kontrolü ───────────────────────────────────────────────
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException(
        'Refresh token süresi dolmuş. Lütfen tekrar giriş yapın.',
      );
    }

    // ── 3. Mevcut token'ı iptal et (Rotation: her kullanımda yeni token) ───
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data:  { revokedAt: new Date() },
    });

    // ── 4. Kullanıcının güncel rolü ve tenant planını bul ────────────────────
    const userTenant = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId: record.userId, tenantId: record.tenantId },
      },
      include: { tenant: { select: { plan: true } } },
    });

    if (!userTenant) {
      throw new UnauthorizedException(
        'Tenant ilişkisi bulunamadı. Lütfen tekrar giriş yapın.',
      );
    }

    // ── 5. Yeni token çifti üret ─────────────────────────────────────────────
    this.logger.log(
      `Token yenileme: userId=${record.userId} | tenant=${record.tenantId} | plan=${userTenant.tenant.plan}`,
    );

    return this.generateTokenPair(record.userId, record.tenantId, userTenant.role, userTenant.tenant.plan);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÇIKIŞ — Refresh token'ı iptal et
  // ═══════════════════════════════════════════════════════════════════════════
  async logout(refreshToken: string): Promise<void> {
    // updateMany: token bulunamazsa 0 etkilenen satır — hata fırlatma
    const result = await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data:  { revokedAt: new Date() },
    });

    this.logger.log(`Çıkış: ${result.count} oturum kapatıldı.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZEL: Token çifti üretimi
  // ═══════════════════════════════════════════════════════════════════════════
  private async generateTokenPair(
    userId:   string,
    tenantId: string,
    role:     string,
    plan:     string = 'SOLO',
  ): Promise<AuthTokens> {
    // ── Access Token: stateless JWT ──────────────────────────────────────────
    // plan claim: plan gating (ProPlanGuard) tarafından okunur; her login'de güncellenir.
    const payload: JwtPayload = { sub: userId, tenantId, role, plan };
    const accessToken = this.jwt.sign(payload);  // expiresIn JwtModule'den (15m)

    // ── Refresh Token: opaque (48 byte = 96 hex karakter) ────────────────────
    const rawToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TTL_DAYS);

    // Veritabanına kaydet (tenantContext null olabilir — açıkça tenantId ver)
    await this.prisma.refreshToken.create({
      data: { token: rawToken, userId, tenantId, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawToken,
      expiresIn:    ACCESS_TTL_SEC,
    };
  }
}
