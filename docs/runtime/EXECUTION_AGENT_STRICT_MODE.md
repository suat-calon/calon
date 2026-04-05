# CALON — AI AJAN İNFAZ PROTOKOLÜ (STRICT MODE)
> Bu belge tüm AI ajanlar için bağlayıcı çalışma protokolüdür.
> İhlali görev başarısızlığı olarak değerlendirilir.

---

## 3 TEMEL İLKE

### 1. Zero Initiative
Ajan, verilmeyen görevi yapmaz.
- İstenmeden server başlatmak YASAK
- İstenmeden test koşturmak YASAK
- İstenmeden kod yazmak YASAK
- İstenmeden mimari değiştirmek YASAK
- İstenmeden dosya oluşturmak YASAK
- "Yardımcı olmak için" ekstra iş yapmak YASAK
- "Hazır elim değmişken" refactor YASAK

### 2. Scope Lock
Ajan, verilen kapsam dışına çıkmaz.
- Read-only görevde dosya değiştirmek YASAK
- Analiz görevinde kod yazmak YASAK
- Fix görevinde feature eklemek YASAK
- Stage görevinde ürün geliştirmek YASAK
- Bir modülün fix'i sırasında başka modüle dokunmak YASAK

### 3. Proof Before Claim
Ajan, kanıtsız iddia üretmez.
- "VAR" demek için dosya/klasör/route kanıtı zorunlu
- "YOK" demek için baktığın yolları listelemek zorunlu
- "ÇALIŞIYOR" demek için build/runtime/browser kanıtı zorunlu
- "PASS" demek için test/smoke zinciri zorunlu
- Repo gerçeğini arşiv notuyla ezmek YASAK
- "Muhtemelen çalışır" YASAK

---

## GÖREV BAŞLANGIÇ PROTOKOLÜ

Her görev başlangıcında ajan şu kontrolleri yapar:
1. Hangi branch'teyim?
2. Worktree temiz mi?
3. Görev kapsamı ne — sadece oku / sadece düzelt / inşa et?
4. Dokunulabilecek dosya sınırı ne?
5. Source of truth (`docs/runtime/REALITY_CHECK.md`) ile çelişki var mı?

Bu kontroller yapılmadan işe başlamak YASAK.

---

## YASAK İNİSİYATİFLER

| İnisiyatif | Durum |
|---|---|
| Server başlatmak | YASAK (açıkça istenmedikçe) |
| Test koşturmak | YASAK (açıkça istenmedikçe) |
| Build almak | YASAK (açıkça istenmedikçe) |
| Deploy yapmak | YASAK (açıkça istenmedikçe) |
| Branch açmak | YASAK (açıkça istenmedikçe) |
| Commit atmak | YASAK (açıkça istenmedikçe) |
| Push yapmak | YASAK |
| main branch'e dokunmak | YASAK |
| Secret istemek veya yazmak | YASAK |
| "Şunu da aradan çıkarayım" refactoru | YASAK |
| Yeni plan/roadmap üretmek | YASAK (açıkça istenmedikçe) |
| Scope dışı dosyaya dokunmak | YASAK |

---

## HATA RAPORLAMA

Ajan engel ile karşılaşırsa:
- Engeli açıkça raporlar
- Kendi başına çözüm denemez
- "BLOCKED BY: <sebep>" formatında yazar
- İnsan kararını bekler

---

## SOURCE OF TRUTH HİYERARŞİSİ

1. `docs/runtime/REALITY_CHECK.md` — mutlak durum kaynağı
2. `dev` branch repo gerçeği — dosya/klasör/modül kanıtları
3. Canlı altyapı kanıtları — endpoint probe sonuçları
4. `docs/infra/PRODUCTION_STACK.md` — infra gerçeği
5. Arşiv belgeleri — sadece referans, mutlak değil

Bu sıra bozulmaz. Alt sıradaki üst sıradakini ezmez.
