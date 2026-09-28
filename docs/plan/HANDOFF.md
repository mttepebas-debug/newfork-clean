# Koordinatör devri — 2026-09-27 gece (Pazar 19:20 PDT / Pazartesi 02:20 UTC)

Eski koordinatör: "Hand off raporu" oturumu (`local_323e063c-efb6-4451-a9c6-39a35ec5e057`), bağlamı doldu.
Yeni koordinatör: bu dosyayı okuyan oturum. `CLAUDE.md` §3 ve §12'deki koordinatör kimliğini kendi
kimliğinle güncelle (kullanıcı onayıyla; önceki devirde de böyle yapıldı) ve rol oturumlarına yeni kimliği
bildir. Ölçüm anı: `origin/main` = `ebf1d42c`. Kullanıcı telefondan (Remote Control) izliyor. Dil: sade
Türkçe; karmaşık kararlar başlık başlık, örnekli, chat'te sorulur (kullanıcının isteği).

## 0. İlk işler (sırayla)
**Durum 2026-09-28 (kayıt `nf-planlama`):** kuyruk bitti — 2a–2c ve 4–8 main'de, hepsinde main CI yeşil (koordinatör); açık kalan yalnız BL-217 (madde 3). Hosted gönderim de yapıldı (2026-09-28).
1. **(09-28 penceresi geçti; kural BL-238 kapanana kadar her Pazar geçerli.)** **Pasifik 00:00'dan (07:00 UTC) ÖNCE main'e KOD gönderme.** BL-238 (aşağıda) yüzünden Pazar akşamı
   e2e `schedule-locks.spec.ts` main'de de kırmızı; CI kırmızı olur ve main donar. Docs push serbest.
2. 00:00 PDT'den sonra üç birleştirme, sırayla, her birinde CI'ı izle:
   a. **BİTTİ 09-28 (`65bdeaae`, main CI yeşil).** **`../newfork-wt/merge-0927d`** (branch `merge-0927d`, hazır): BL-198 (DB+web, ONAY @2875a823),
      BL-212 (ONAY @a8f40a53), BL-205 (ONAY @4a92dd39 güvenlik + @b3cc5cdb görsel), BL-197 web
      (ONAY @ff866053) + BL-197 arayüz (ONAY @3c5f8f16 ikisi). Kod kapısı yeşil (lint/typecheck/test/build).
      test:db: BL-198 migration (20260927114500) yerel DB'ye UYGULANDI; kırmızı kümesi bilinen yerel
      kaymalar (BL-237, BL-209 çifti). e2e 10/12 — düşen ikisi schedule-locks (BL-238, main'de de düşüyor,
      nf-test kanıtladı). Yapılacak: `git fetch && git rebase origin/main`, gece yarısından sonra
      `pnpm.cmd e2e` (db.lock) → 12/12 bekle → main.lock → `git push origin HEAD:main` → `gh run watch`.
   b. **BİTTİ 09-28 (`efef60c1`).** **BL-234** `bl234` @5a6a7a24 (ONAY): aynı hafta iki kez yayınlanıp yeniden düzenlenince Publish
      önizlemesi 500. Migration `20260927165000`. nf-test'in builder.sql düzeltmelerini de taşıyor
      (bl210'daki 6349add9 + 75b16f6c eşdeğerleri). Pencere: migration up + test:db + e2e + kapı.
   c. **BİTTİ 09-28 (`2cdffd2c`, TODO'lar `108dee9c`).** **BL-218 .2** `bl218-s3` @30056d12 (ONAY; `bl218-1` @76289c7d + S3 kararını kilitleyen test, nf-guvenlik ONAY 2026-09-28): Management/Owner veritabanı kuralları. Migration
      `20260927160000` — BL-234'ün 165000'inden ESKİ, `--include-all` gerekir. BL-234 girince nf-db
      `excluded_person_leaves_new_drafts`'teki 2 TODO'yu kaldıracak (haber ver).
3. **e2e kısmı BİTTİ** (merge-0927d içinde); **BL-217 AÇIK.** BL-198 e2e spec (`bl198-e2e` @2b56dc8a, ONAY) merge-0927d'ye EKLENDİ (tam e2e 11/13, düşen 2 = BL-238).
   Sonra ve BL-217
   (`bl217-rebase-on-bl198` @ed158ef9, nf-guvenlik ONAY @c794f296 içeriği; rebase'li hali yeniden bakılmalı).

4. **BİTTİ 09-28 (`8f80282c`).** BL-237 `bl237-date-tests` @e1a05ae2 ONAY (nf-test, 5 pgTAP dosyası tests.world()'e; Düşük 1: taslak arşivi doğrudan update, not).
   BL-234'ten SONRA birleştir (ikisi de publish_week/taslak adlarıyla ilgili).

5. **BİTTİ 09-28 (`74bb480e`).** **BL-192** `bl192-a` @f7516d79 (nf-guvenlik ONAY @f7516d79, nf-gorsel-qa ONAY @d44a3a75; taban c81a5bbb): telefonda yönetim alt çubuğu. BL-237'den sonra.
6. **BİTTİ 09-28 (`59b41c7f`).** **BL-231** `bl231-db` @16690fb5 (ONAY, migration 20260928010000) + nf-backend `bl231` (yapılıyor). İkisi birlikte, BL-192'den sonra.
7. **BİTTİ 09-28 (`51bf2b8e`).** **BL-230** `bl230` @409e2c2f (ONAY; merge-0927d 0a92268e üstünde, migration 20260928020000): yayından kaldırılan haftada onaylı takas korunur (K13 a). merge-0927d'den sonra rebase.
8. **BİTTİ 09-28 (`8dfdfcbe`).** **BL-221** `bl221` @a6972a19 (ONAY; migration 20260928030000): belgesi eksik owner'ın kendi izni onaysız (K12). Düşük 1 fixture devir yoluyla kurulabilir; Düşük 2 kısayol "workspace açık" kontrolünü atlıyor (talep yolu zaten kapılı).
Birleştirme penceresinde bl052_document_notifications / bl052_document_account_inbox kırmızısı bilinen yerel kayma (ortak DB'de 99 birikmiş pending bildirim; CI'da düşmez, nf-test 2026-09-28).

## 1. Bugün (09-27) main'e girenler
Settings 8 sayfa API'den (FB-6.1.9 bitti: 0693b51, a833cbe, bee7713d), read_role_workspace silindi
(131000), Settings 6 tablonun tarayıcı SELECT'i kapandı (150000, 89fdf494), BL-183 owner izni bildirimi
(130000), BL-197 DB (140000), BL-188, BL-208, BL-186, ghost 11b, BL-148/166. Planlama: BL-218/FB-6.2
ready, FB-6.1b görev dosyası, BL-059 Stripe araştırması, BL-219..238. nf-guvenlik hafızası (6f57614b).
Son CI: bee7713d ve 89fdf494 koşuları altyapı yüzünden iptal (WSL çöktü, PC yeniden başlatıldı);
89fdf494'ten beri main'de kod var ama yeşil CI koşusu YOK — ilk gönderimin CI'ı bunları da kapsar.

## 2. Rol oturumları (hepsi Remote Control açık, sabitli)
- `Rol: nf-db — BL-218` (`local_0af84e96…`): BL-238 salt okunur ölçüm yapıyor (current_date kullanan
  sunucu fonksiyonları, saat dilimi kaynağı, önerilen yardımcı). Sonra BL-218 S1/S2/exclude ek
  migration'ı (kullanıcı cevabına bağlı), ızgara okumasına system_key (.3 DB kısmı), FB-6.1b .1 (BL-159).
- `Rol: nf-test` (`local_0efbf957…`): BL-198 tam e2e (spec 9b65ec47), sonra BL-237 (5 pgTAP dosyasını
  tests.world()'e taşı; paylaşılan seed'e yazma YOK — izin sınıflandırıcısı reddetti, doğru).
- `Rol: nf-arayuz` (`local_6a90e9ce…`): boşta. Aday: BL-192 seçimi gelince uygulama, BL-233.
- `Rol: nf-backend` (`local_4b0cc8af…`): bağlam dolu, devir notu `bl197-web`:.claude/agent-memory/
  nf-backend/handoff-2026-09-27.md (merge-0927d içinde). Yeni nf-backend oturum kartı çıkarıldı
  (task_02c4ea9f); açılınca RC + pin, ilk iş BL-231 sözleşme önerisi.
- `Rol: nf-guvenlik`, `Rol: nf-gorsel-qa`, `Rol: nf-planlama`: boşta.
- Arşivlenebilir (doğrulandı, iş/branch/kilit yok): `Rol: nf-db (Veritabanı ve Yetki)` (eski, BL-208),
  `Rol: nf-db — Settings okumaları`, `Rol: nf-db — BL-198` (BL-198 main'e girince). Arşivden önce RC
  kapatılmalı; kullanıcıya sor.

## 3. Kullanıcıdan bekleyen kararlar
Cevaplandı 2026-09-28 (yeni koordinatör `local_08c32131…`): 1 S1 hayır, 2 S2 hayır, 3 exclude'da taslak vardiya kalsın,
4 BL-230 (a) en son yayın, 5 BL-221 evet onaysız, 6 BL-192 A alt çubuk. Kayıt: BACKLOG, ILERLEME-PLANI K12/K13/K17/K18, tasks/BL-218.md.
Cevaplandı 2026-09-28 (ikinci tur): K5 hosted gönderim (yapıldı), K14 Settings S1–S4, K16 FB-6.1b S1–S3,
K11 BL-214/216, BL-235 rozet rengi (koordinatör), BL-078, BL-246 (devirde belge muafiyeti), ve bu turda:
- K8 arşivli iş/tip adı: kartta ve dışa aktarmada arşivli ad ("Line Cook"), "Shift" değil, etiket yok → yeni **BL-254** (`nf-db` → `nf-backend`).
- BL-214 ek: Settings'teki beş genel form alanı (ham `#c7cfcb`) görsel tutarlılık paketine girer, kenar `--theme-muted`.
- BL-252: çalışan kaydı olmayana devir reddedilmez; kabulde kayıt otomatik açılır ve Owner işine yerleşir → BL-246 ile tek `nf-db` işi.
Kayıt: BACKLOG, REUSE "Ürün kuralları" (Rütbe altı + "Arşivli iş ve vardiya tipi adı"), ILERLEME-PLANI K8/K11.
Açık (kullanıcı): K19 BL-238 saat dilimi ve K10 FB-6.3 S4 (ikisi de uzun konuşulacak), K15 Stripe S1–S7 (F4), K7 FB-6.1 `.0` ekran turu + `.13`.
Açık (koordinatör teyidi, iş başlamadan): BL-252 — yeni owner'ın arşivlenmiş çalışan kaydı varsa yeni kayıt mı açılır, arşivden mi döner;
BL-254 — karar Schedule'daki çakışma penceresini ve başka lokasyonun soluk (ghost) vardiyalarını da kapsıyor mu. Liste `ILERLEME-PLANI.md` §2.

## 4. Hosted gönderim (FB-6.1.14) için not
**Kapandı 2026-09-28:** gönderim yapıldı (26 migration, son sürüm `20260928030000`); ad çakışması sayımı 0, advisors'ta yeni bulgu yok. Management/Owner ad çakışması sayımı (BL-218 Düşük 3) bayat: backfill düşmedi, hosted'da 3 sistem departmanı + 3 sistem işi doğrulandı (koordinatör). Ayrıntı `tasks/FB-6.1.md` Notes.
Önce: aktif "Management"/"Owner" adlı departman/iş sayımı (BL-218 Düşük 3; ad çakışması backfill'i
düşürür); migration 140000 API'den önce/aynı anda (BL-197); BL-209 yerel saat dilimi komutu kullanıcıda.

## 5. Kullanıcının yapacakları
BL-209 onarım komutu (yerel Main Dining saat dilimi) ve worktree temizlik betiği
(`artifacts/koordinator/cleanup-worktrees-2026-09-27.sh`) hâlâ bekliyor olabilir — sor.

## 6. Dersler (bu oturumdan)
- Rol oturumu salt okunur ise (nf-guvenlik) hafıza notunu koordinatör main'e alır; commit iste(me).
- `git cherry-pick --abort` bütün diziyi geri alır; tek commit'i atlamak için `--skip`.
- Yerel test:db kırmızısı önce "paket mi, yerel kayma mı" diye ayrılır; bugün üç ayrı yerel kayma çıktı
  (BL-209 saat dilimi, BL-237 bayat seed haftası, BL-238 UTC/Pacific).
- "Fazla düzgün sonuç": ci-green kontrol döngüsünde CRLF yüzünden her dosya "NOT OK" çıktı; `tr -d '\r'`.
