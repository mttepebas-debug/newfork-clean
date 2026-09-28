# Koordinatör devri — 2026-09-28

Eski koordinatör: "Koordinatör (devir 2026-09-27 gece)" (`local_08c32131-90ea-4552-9d19-9b1a7dae5a5a`), bağlamı yarıyı geçti; devir önerildi.
Yeni koordinatör: bu dosyayı okuyan oturum. `CLAUDE.md` §3 ve §12'deki koordinatör kimliğini kendi kimliğinle güncelle (kullanıcı onayıyla; önceki devirlerde de böyle yapıldı) ve rol oturumlarına yeni kimliği bildir.
Ölçüm anı: `origin/main` = `01871a2c` (+ bu kaydın dalı), 2026-09-28; yerel DB = main (son migration `20260928040000`). Kullanıcı telefondan (Remote Control) izliyor. Dil: sade Türkçe; karmaşık kararlar başlık başlık, örnekli, chat'te sorulur. **Kullanıcı aynı anda tek iş istiyor.**
Durumun tamamı: `docs/plan/ILERLEME-PLANI.md` (sürüm 3). Kayıt tutan rol: `nf-planlama` (`local_c67b8d60…`).

## 0. İlk işler (sırayla)
1. **SEC-003 hesap güvenliği paketini `nf-db`'ye ver** (`docs/plan/tasks/SEC-003.md`, Status ready; BL-266, BL-267, BL-268, BL-269, BL-274). Sıra: `nf-db` → `nf-backend` → `nf-test` (gerekirse `nf-arayuz` metin), paralel yazma yok. Birleştirmeden önce kullanıcıya ultrareview öner. Not: kullanıcı ve eski koordinatör bu işe bazen "SEC-002" dedi; `tasks/SEC-002.md` 2026-09-22'den beri başka bir iş (done), kayıttaki adı SEC-003.
2. **Hosted panel kontrolü kullanıcıda** (başlamayı engellemez): Authentication → "Require current password when updating" ve "Confirm email". S2 (a) kararıyla "Confirm email" açılacak — ayrı hosted işlem, kullanıcının kendi "evet"i; araçlar ayarı değiştiremiyorsa kullanıcı panelden yapar. SEC-003 Risk'teki e-posta teslimatı (hosted SMTP, Resend) ölçülmedi; ücretli servis gerekirse dolar tutarıyla sor.
3. **BL-265 hosted gönderim:** bekleyen migration `20260928040000` (BL-252 + BL-246). Önce D1 sayımı (owner cümlesiyle muaf ama artık owner olmayan satırlar; kod yok, yalnız sayım), sonra kullanıcı onayı, sonra advisors.
4. **Sonraki iş BL-199** (müdür Schedule'da vardiyaya not yazamıyor) — SEC-003'ten sonra (kullanıcı kararı).
5. **Pazar kuralı (BL-238 kapanana kadar):** Pasifik 00:00'dan (07:00 UTC) önce Pazar akşamı main'e KOD gönderme; e2e `schedule-locks.spec.ts` o saatlerde main'de de kırmızı. Docs gönderimi serbest.
6. **Açık kalan eski kuyruk:** BL-217 (`bl217-rebase-on-bl198` @ed158ef9; `nf-guvenlik` ONAY @c794f296 içeriği, rebase'li hali yeniden bakılmalı; BL-209 onarımından sonra).

## 1. Bugün (09-28) main'e girenler — hepsinde main CI yeşil
- **Gece:** BL-198, BL-212, BL-205, BL-197 (`65bdeaae`), BL-234 (`efef60c1`), BL-218 `.1`–`.2` (`2cdffd2c`, `108dee9c`), BL-237 (`8f80282c`), BL-192 telefonda yönetici alt çubuğu (`74bb480e`), BL-231 (`59b41c7f`), BL-230 (`51bf2b8e`), BL-221 (`8dfdfcbe`). Hosted toplu gönderim (26 migration, son `20260928030000`).
- **Gündüz:** BL-239 + BL-240 tek telefon kırılımı 720px (`2ca3803e`); görsel tutarlılık paketi BL-214, BL-216, BL-235, BL-250, BL-251 (`dc3c9730` + `7127bd96`, run 36406391992); BL-252 + BL-246 + BL-263 sahiplik devrinde owner kuralları (`efdc4872`, `cb6013fb`, run 36416053874).
- **Kayıtlar (`nf-planlama`):** kullanıcı kararları (K8 → BL-254, BL-214 form alanları, BL-252 S1 (a) / S2 (b), BL-218 `.5` gruplama, BL-199 sırası, BL-100 silme — kullanıcı çalıştırdı); ILERLEME sürüm 3; tüm repo kod denetimi → BL-266..282 ve 7 mevcut maddeye genişleme; `tasks/SEC-003.md`; BL-261..265.

## 2. Rol oturumları (Remote Control açık, sabitli; ListAgents 2026-09-28)
| Oturum | Kimlik | Durum |
|---|---|---|
| `Rol: nf-db — BL-218` | `local_0af84e96…` | boşta; SEC-003'ün ilk adımı ona |
| `Rol: nf-backend` | `local_cb173b54…` | boşta; SEC-003 ikinci adım |
| `Rol: nf-test` | `local_0efbf957…` | boşta; SEC-003 e2e, BL-262 (yerel kırmızı listesi ölçümü) adayı |
| `Rol: nf-arayuz` | `local_6a90e9ce…` | boşta |
| `Rol: nf-guvenlik` | `local_8127d370…` | boşta; her kod işinin incelemesi |
| `Rol: nf-gorsel-qa` | `local_13e7e4de…` | boşta |
| `Rol: nf-planlama` | `local_c67b8d60…` | boşta; bütün `docs/plan` kayıtları |
- **Arşiv adayı:** eski `nf-db` oturumları "BL-198" (`local_3ee31446…`) ve "Settings okumaları" (`local_eafab146…`) boşta. Arşivden önce doğrula (iş, dal, kilit yok), RC açıkken arşiv reddedilir; kullanıcıya sor.

## 3. Kullanıcıdan bekleyen kararlar (liste: `ILERLEME-PLANI.md` §2)
- **K7** FB-6.1 `.0` ekran turu + `.13` görsel kararlar (30–45 dk; FB-6.1'i kapatan tek şey).
- **K10** FB-6.3 S4 — onaylı iznin iptalini kim onaylar (uzun konuşulacak).
- **K15** faturalama BL-059 S1–S7 (F4).
- **K19** BL-238 — çok saat dilimli workspace'te hafta ne zaman geçmiş sayılır (uzun konuşulacak).
- **K20** BL-255 — ikinci beyaz düğme sistemi (16 ekran) tek sisteme birleşsin mi; önce/sonra görüntüsüyle sorulur.
- **K21** BL-254 (arşivli iş/tip adı) başlasın mı.
- **Hosted panel kontrolü** ("Require current password", "Confirm email") — §0 madde 2.
- Kod denetiminin önerdiği sıranın kalanı (SEC-003'ten sonra): BL-271 önbellek, BL-270 + BL-276 eski kapı, BL-272 + BL-101 dışa aktarma, BL-278 + BL-273 bayat ekran, BL-281 CI bekçisi — öneri, kullanıcı kararı bekliyor (ILERLEME §3).

## 4. Hosted
- **Bekleyen:** BL-265 — migration `20260928040000_the_new_owner_is_asked_for_no_document.sql`. Sıra: D1 sayımı (salt SELECT) → kullanıcı onayı → `supabase db push` (linked CLI; kullanıcının kendi "evet"i bu pencerede) → security advisors.
- Hosted son sürüm `20260928030000`; web/API Vercel'de henüz yayında değil.
- Hosted CLI ve yerel DB'ye kalıcı yazım auto-mode'da engelleniyor → komutu kullanıcıya PowerShell satırı olarak ver (§6).

## 5. Kullanıcının yapacakları
- Hosted panel kontrolü (§0 madde 2); S2 (a) için "Confirm email"i açmak (kendi "evet"iyle).
- `../newfork-wt/bl252` boş klasörü: terminal kapanınca silinecek.
- BL-209 onarım komutu (yerel Main Dining saat dilimi) ve worktree temizlik betiği (`artifacts/koordinator/cleanup-worktrees-2026-09-27.sh`) hâlâ bekliyor olabilir — sor. Ölçüm (ILERLEME §6): 43 birleşmemiş görünen dal, 34 worktree.

## 6. Dersler (bu oturumdan)
- **Karar satırına yalnız kullanıcının cevabı yazılır.** BL-252 S2 (b) kaydına seçenek metninden "süre devir anından başlar" ve hiç sorulmamış "elle verilmiş muafiyetler kalır" girdi; koordinatör main'den önce yakaladı. Seçenek metni ya da çıkarım açık soru satırına gider. (Aynı kök: O2 — "42501 + `authz.*`" koordinatörün aktarımıydı, kullanıcının kararı yalnız "reddedilsin"di.)
- **Ultrareview ölçülmemiş varsayımı yakaladı:** "acknowledgement'lar yalnız onboarding'de gelir, admin'e gelmez" ölçülmeden kabul edilip BL-252 kapsamından çıkarılmıştı; kullanıcının ultrareview'u yanlış olduğunu buldu. Kapsam daraltan her varsayım önce ölçülür.
- **Hosted CLI ve yerel DB'ye kalıcı yazım auto-mode'da engelleniyor:** BL-100 silme SQL'i geri alınan denemede temizdi, kalıcı çalıştırma engellendi; kullanıcıya PowerShell komutu verildi, kullanıcı çalıştırdı. Plan bunu baştan varsaysın.
- Önceki devirden hâlâ geçerli: yerel `test:db` kırmızısı önce "paket mi, yerel kayma mı" diye ayrılır (BL-209, BL-237, BL-238 türü); "fazla düzgün sonuç" CRLF yüzünden olabilir (`tr -d '\r'`); `git cherry-pick --abort` bütün diziyi geri alır, tek commit için `--skip`.
