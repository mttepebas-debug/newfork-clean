# İlerleme planı — çoklu rol oturumu (sürüm 3, 2026-09-28)

Hazırlayan: `nf-planlama` (`local_c67b8d60-…`). Koordinatör: "Koordinatör (devir 2026-09-27 gece)", `local_08c32131-90ea-4552-9d19-9b1a7dae5a5a`.
Ölçüm: `origin/main` `916ef652`, 2026-09-28; yerel DB = main (son migration `20260928030000`); main CI son kod koşusu yeşil (run 36406391992, `7127bd96`). Sürüm 2: `bee7713d` ölçümü (2026-09-27 akşam).
Bu dosya bir çalışma planıdır; sıra değişince güncellenir, iş kapandıkça satırı "bitti" olur. Kaynaklar: `ROADMAP.md`, `MVP-PLAN.md`, `tasks/FOUNDATION-B.md`, `BACKLOG.md`.

## 1. Nerede duruyoruz
- **FOUNDATION-B ~%58** (sürüm 2 ile aynı formül: 9,75 + 2,4 × 0,82 + 0,1 = 11,8 / 20,5; tahmin ağırlıklı). **Değişmedi:** 09-28 gündüz main'e girenler programın adımı değil, backlog ve cila işi. Aşama 1–5 bitti. Takvim dilimi (FB-6.1) **%82 = 14/17 adım satırı**: açık `.0` ekran turu, `.13` görsel, `.14` kapanış (hosted gönderim yapıldı). BL-218 `.1`–`.2` main'de, `.3` (`nf-backend`) başlamadı; FB-6.2 (Çalışanlar) ready, `.4` BL-218 `.3`'ü bekliyor. Aşama 7 başlamadı.
- **09-28 main'e girenler (hepsinde main CI yeşil):**
  - gece: BL-198, BL-212, BL-205, BL-197 (`65bdeaae`), BL-234, BL-218 `.1`–`.2`, BL-237, BL-192 (telefonda yönetici alt çubuğu), BL-231, BL-230, BL-221;
  - gündüz: BL-239 + BL-240 (tek telefon kırılımı 720px, `2ca3803e`); **görsel tutarlılık paketi** (BL-214, BL-216, BL-235, BL-250, BL-251; `dc3c9730` + `7127bd96`): beyaz düğmeler ve form alanları aynı koyu kenarda, altı ikiz renk silindi, uyarı işareti okunur, iki alt çubuk aynı;
  - kayıt: BL-100 (yerel DB'deki FX artığı silindi), BL-078 (işlem gerekmez).
- **Şu an çalışan:** yok. **BL-252 + BL-246 + BL-263 bitti 2026-09-28** (`cb6013fb`, main CI yeşil run 36416053874): devir yalnız çalışan kaydı olan admin'e, yeni owner'ın belgeleri muaf, eski owner'ın owner muafiyetleri kalkar. Hosted'a gönderilmedi (BL-265).
- **Hosted:** 26 migration gönderildi (son `20260928030000`), advisors temiz. Web/API Vercel'de henüz yayında değil.
- **MVP geneli ~%45–50** (2026-09-26 raporu; ölçülmedi).

## 2. Karar bekleyenler
**Açık (kullanıcı):**
| # | Karar | Not |
|---|---|---|
| K7 | FB-6.1 `.0` ekran turu + `.13` görsel kararlar | kullanıcının müsait olduğu ilk gün, 30–45 dk; FB-6.1'i kapatan tek şey |
| K10 | FB-6.3 S4 — onaylı iznin iptalini kim onaylar | uzun konuşulacak; soru `tasks/FB-6.3.md`'de |
| K15 | Faturalama (BL-059) S1–S7 | F4; kod FOUNDATION-B sonrası |
| K19 | BL-238 — çok saat dilimli workspace'te hafta ne zaman geçmiş sayılır | uzun konuşulacak; her Pazar yöneticiyi ve CI'ı etkiliyor |
| K20 | BL-255 — ikinci beyaz düğme sistemi (`.job-secondary-button`, 16 ekran: Settings → Jobs, Locations, Documents, Announcements…) tek sisteme birleşsin mi | görünüm 16 ekranda değişir; önce/sonra görüntüsüyle sorulur |
| K21 | Sıradaki `nf-db` işlerinin başlaması: BL-254 (arşivli iş/tip adı) | kullanıcı aynı anda tek iş istiyor; sıra §3 |

**Cevaplı (kayıtta; ayrıntı BACKLOG / REUSE / görev dosyaları):** K1–K4 FB-6.2 S1–S4 · D1–D5 Management/Owner · K5 hosted gönderim (yapıldı 09-28) · K6 BL-209 hedefli onarım (komut kullanıcıda) · K8 arşivli ad görünür (→ BL-254) · K9 onboarding yedi adım (F4'ten önce) · K11 görsel paket (bitti) · K12 BL-221 · K13 BL-230 · K14 Settings S1–S4 (→ FB-6.8) · K16 FB-6.1b S1–S3 · K17 BL-218 S1–S3 · K18 BL-192 · **09-28 gündüz:** BL-252 S1 (a) kayıt değişmezi + S2 (b) eski owner'ın muafiyetleri kalkar (S3/S4 `nf-db` ölçümüyle kapandı) · BL-218 `.5` Owner iş listesinde Management altında kilitli, liste departmanlara göre gruplu · BL-199 sırası (devir işinden sonra) · BL-100 yedeksiz silme (yapıldı).

## 3. Sıradaki en önemli iş (gerekçesiyle)
1. ~~BL-252 + BL-246~~ **bitti 2026-09-28** (`cb6013fb`).
2. **BL-199 — müdür Schedule'da vardiyaya not yazamıyor** (`nf-arayuz` alan + `nf-backend` kaydetme doğrulaması + e2e). Kullanıcı kararı 09-28: devir işinden hemen sonra.
3. **BL-218 `.3` → FB-6.2.** Programın kritik yolu: `.3` (`nf-backend`) FB-6.2 `.4`'ün son önkoşulu. `.5` artık veri parçası da istiyor (işlere departman + `system_key`: önce `nf-db` okuma + `nf-backend`, sonra `nf-arayuz` varyantları). FB-6.1b `.1` (BL-159) de başlayabilir (Ç8).
4. **BL-238** (Pazar akşamı "bu hafta" UTC'ye göre; high/risky) — K19 konuşulunca.
5. **K7 ekran turu** — FB-6.1'i %100'e taşır; kullanıcının günü.

**Kod denetiminin önerdiği sıra (2026-09-28; öneri, kullanıcı kararı bekliyor — yukarıdaki sırayı değiştirmez, BL-199 sıradaki kalır):** (1) hesap güvenliği BL-266, BL-267, BL-268, BL-269, BL-274 (high/risky, ultrareview ile); (2) çıkışta önbellek temizliği + iki kullanıcılı test BL-271 (high/safe); (3) eski kapı → çekirdek, matrise ikinci admin BL-270 + BL-276 (high/risky, ultrareview ile); (4) dışa aktarma cron'u ve ekleri BL-272 + BL-101 (high/safe); (5) bayat ekranlar BL-278 + BL-273 (medium/safe); (6) CI bekçisi, `todo`, `forbidOnly` BL-281 (medium/safe). Kaynak: `BACKLOG.md` "Yeni bulgular (2026-09-28 kod denetimi)".

## 4. Şeritler (paralel rol oturumları)
Kurallar: aynı dosyaya iki rol aynı anda konmaz (CLAUDE.md §4); aynı anda en çok iki ağır iş; migration ortak yerel DB'ye yalnız birleştirme penceresinde (`scripts/lock.mjs`); her kod işi `nf-guvenlik`, ekranı değişen `nf-gorsel-qa`. **Kullanıcı aynı anda tek iş istiyor (2026-09-28):** şeritler sıra listesidir, paralel başlatma kullanıcı onayıyla.

| Şerit | Rol | Şimdi | Sonra | Bekleyen |
|---|---|---|---|---|
| A — DB | `nf-db` | — | BL-254 (K21) · BL-218 `.5` veri okuması · FB-6.1b `.1` (BL-159) · FB-6.2 `.1` | BL-209 onarımı (komut kullanıcıda), BL-217 (BL-209'dan sonra) |
| B — API/web veri | `nf-backend` | — | BL-199 kaydetme yolu · **BL-218 `.3`** · BL-254 web (3 satır) · FB-6.2 `permissions.includes` → `can()` | BL-213 |
| C — Arayüz | `nf-arayuz` | — | **BL-199** alan + metin · BL-218 `.4`–`.6` · BL-256..260 (küçük, tek iş) | BL-255 (K20) |
| D — Test | `nf-test` | — | BL-199 e2e · BL-245 (bildirim testleri yerelde kararsız) · BL-120 (tam koşuda zaman aşımı; 09-28 yine düştü) | BL-217 |
| E — Plan | `nf-planlama` | — | FB-6.1 kapanış notu (`.0` + `.13`'ten sonra) · her birleştirmenin kaydı | — |
| F — İnceleme | `nf-guvenlik`, `nf-gorsel-qa` | çağrıldıkça | | |
| Koordinatör | — | BL-265 hosted (kullanıcı onayıyla) | Ekran turu K7 · temizlik (§6) | |

## 5. Çakışmalar ve sıralama kuralları
- **Ç1 — FB-6.2 Employees ekranı.** `EmployeeDrawer`/`EmployeesPage`'teki `permissions.includes` → `can()` FB-6.2'nin Done when 6'sı; çekmecenin okumaları BL-231 ile API'den geçiyor (bitti 09-28). BL-243, BL-244 FB-6.2 diliminde.
- **Ç2 — BL-206 (ölü kod silme)** BL-198'den ve hosted gönderimden sonra: ikisi de oldu, BL-206 artık başlayabilir.
- **Ç3 — BL-187 FB-6.2 `.6`'da** (koordinatör kararı 09-27).
- **Ç4 — Çekirdek sahipliği.** `app_private.authz_check`'e dokunan işler (FB-6.2 `.1`–`.4`) aynı anda yazılmaz; A şeridinde ardışık, her biri kendi birleştirme penceresinde.
- **Ç5 — Yayın.** Web/API Vercel yayını yapılınca security advisors yeniden koşar; arada main'e giren migration'lar aynı pakete.
- **Ç6 — Ortak yerel DB.** BL-209 onarılana kadar yerelde `shift_exchanges_v1`, `time_off_published_assignment_disposition` (ve `weekly_exchange_changed_terms`, BL-227) kırmızısı bilinen yanlış alarm; BL-245 bildirim testleri de yerelde kararsız.
- **Ç7 — Bağlam.** Her rol oturumu iş sınırında bağlam doluluğunu söyler; yarıyı geçince devir (CLAUDE.md §11.10, §12 yenileme).
- **Ç8 — `nf-db` sırası.** (1) FB-6.1b `.1` (BL-159) BL-218 `.2`'den sonra (✓, başlayabilir): ikisi de `apply_schedule_template_service`'e dokunuyor. (2) BL-234 + BL-230 bitti 09-28. (3) **BL-252 + BL-246** sürüyor; **BL-254** ondan sonra, kullanıcı onayıyla (kullanıcı aynı anda tek iş istiyor).
- **Ç9 — BL-218 `.5` veri önce.** Çekmecenin iş listesi bugün düz ve referans okuması işin departmanını ve `system_key`'ini taşımıyor (`tasks/BL-218.md` Notes); `nf-arayuz` varyantları `nf-db` + `nf-backend` parçası main'e girince.

## 6. Temizlik (koordinatör, iş aralarında)
- Ölçüm 2026-09-28 (bu çalışma kopyası): `git branch --no-merged origin/main` **43 yerel dal**, `git worktree list` **34 worktree**. Soy ağacına göre sayım; rebase'le main'e alınmış dallar da "birleşmemiş" görünür, içerik farkı ölçülmedi. Her dal `git cherry` / içerik farkıyla doğrulanıp silinir; bitmiş worktree'ler kaldırılır.

## 7. MVP listesi (kalan, faz sırasıyla)
| Faz | Kalan | Durum | Engel |
|---|---|---|---|
| F0 temel | OPS-010 hosted smoke; SEC-001 (Supabase'ten cevap) | bekliyor | kullanıcı / Supabase |
| FOUNDATION-B | FB-6.1 `.0`/`.13`/`.14`; FB-6.2 … FB-6.8; FB-6.1b; BL-218 `.3`–`.7`; Aşama 7 | ~%58 | K7; kullanıcı tek iş istiyor |
| FJ katılım | JOIN-010, JOIN-007 kalanı; akış 2 "Davet" e2e (FB-6.2'de) | ~%80 | — |
| F1 çekirdek akışlar | UI-DOC-001, BL-038, REQ-AUDIT, BL-048, BL-055; açık high'lar BL-182, BL-127, BL-187 (FB-6.2); BL-199 (sırada) | ~%55 | FOUNDATION-B dilimleri |
| F2 günlük operasyon | ANN-001; Line Up (ayrı proje, MVP'de mi — sorulmadı) | ~%20 | ürün kararı |
| F3 bildirimler | Resend teslimatı, bildirim sistemi yeniden tasarımı, BL-099, BL-101 | ~%20 | FB-6.7 |
| F4 ticari | BL-059 Stripe, BL-034 landing, BL-007/008 (şart) | ~%5 | K15; FOUNDATION-B bitişi |
| F5 cila | BL-193, THEME-003, BL-255..260, BL-249 | ~%30 (BL-192, BL-205, görsel paket bitti; tahmin) | K20 |
| F6 lansman | BL-058 beş tenant e2e, REL-001, REL-002 | başlamadı | hepsi |

## 8. Sıra (koordinatöre)
1. ~~BL-252 + BL-246 birleştirme penceresi~~ bitti 2026-09-28 (`cb6013fb`). Hosted gönderim BL-265 (önce D1 sayımı; kullanıcı onayı).
2. Kullanıcıya tek turda: BL-199'u başlatma onayı, K20 (BL-255, önce/sonra görüntüsüyle), K7 günü.
3. BL-199 (`nf-backend` → `nf-arayuz` → `nf-test`).
4. BL-218 `.3` → `.5` veri parçası → FB-6.2.
5. Temizlik (§6): dal ve worktree sayısı yüksek.
