# İlerleme planı — çoklu rol oturumu (sürüm 4, 2026-09-28)

Hazırlayan: `nf-planlama` (`local_c67b8d60-…`), koordinatörle birlikte (kullanıcı isteği). Koordinatör: "Koordinatör — devir 2026-09-28", `local_41428574-b1a9-44cb-9a7c-cd34afc9456a`.
Ölçüm: `origin/main` `db517fe9`, 2026-09-28; yerel DB = main (son migration `20260928040000`); main CI son kod koşusu yeşil (run 36416053874, `cb6013fb`). Koordinatör girdisi: 2026-09-28 (aynı gün). Sürüm 3: `916ef652`.
Bu dosya bir çalışma planıdır; sıra değişince güncellenir, iş kapandıkça satırı "bitti" olur. Kaynaklar: `ROADMAP.md`, `MVP-PLAN.md`, `tasks/FOUNDATION-B.md`, `BACKLOG.md`, `HANDOFF.md`.

## 1. Nerede duruyoruz
- **Kural: aynı anda tek iş** (kullanıcı talimatı, yeni koordinatör oturumunda tekrarlandı). Paralel kod yazımı yok; `docs/plan` kayıtları ve salt okuma ölçümleri engel değil.
- **Şu an çalışan: SEC-003 hesap güvenliği paketi, adım 1/3 `nf-db`** ("Rol: nf-db — BL-218" oturumu; worktree `../newfork-wt/sec-003`, dal `task/sec-003`, henüz commit yok). `nf-db` kapsamı: eski parolasız silme yolunun iki DB fonksiyonu + `retired_objects_stay_gone` + kapsam kataloğundan iki satır (#4); davet kabulüne `email_confirmed_at` şartı + pgTAP (#9); kalıcı migration yok (birleştirme penceresinde). Sonra `nf-backend`, sonra `nf-test` (yerel `enable_confirmations` ve e2e kararı o adımda). Diğer roller boşta.
- **FOUNDATION-B ~%58** (aynı formül: 9,75 + 2,4 × 0,82 + 0,1 = 11,8 / 20,5; tahmin ağırlıklı; sürüm 3'ten beri değişmedi). Aşama 1–5 bitti. Takvim dilimi (FB-6.1) **%82 = 14/17 adım**: açık `.0` ekran turu, `.13` görsel, `.14` kapanış. BL-218 `.1`–`.2` main'de, `.3` başlamadı; FB-6.2 (Çalışanlar) ready, `.4` BL-218 `.3`'ü bekliyor. Aşama 7 başlamadı.
- **09-28 main'e girenler (hepsinde main CI yeşil):** gece BL-198, BL-212, BL-205, BL-197, BL-234, BL-218 `.1`–`.2`, BL-237, BL-192, BL-231, BL-230, BL-221; gündüz BL-239 + BL-240 (`2ca3803e`), görsel tutarlılık paketi (`dc3c9730` + `7127bd96`), **BL-252 + BL-246 + BL-263** sahiplik devrinde owner kuralları (`cb6013fb`). Kayıtlar: kod denetimi → BL-266..282, `tasks/SEC-003.md`, devir notu (`HANDOFF.md`), koordinatör kimliği (`db517fe9`).
- **Hosted:** son sürüm `20260928030000`; bekleyen migration `20260928040000` (BL-265). Web/API Vercel'de henüz yayında değil.
- **MVP geneli ~%45–50** (2026-09-26 raporu; ölçülmedi).

## 2. Karar bekleyenler
**Açık (kullanıcı) — koordinatör 2026-09-28: bugün yalnız devir soruları soruldu; aşağıdakilerin hiçbiri sorulmadı, cevap yok:**
| # | Karar | Not |
|---|---|---|
| K22 | **Hosted panel kontrolü:** Authentication → "Require current password when updating" ve "Confirm email"; S2 (a) kararıyla "Confirm email" açılacak (ayrı hosted işlem, kullanıcının kendi "evet"i) | kullanıcıya hatırlatıldı, cevap yok; SEC-003'ün başlamasını engellemez, bitişinde gerekir |
| K7 | FB-6.1 `.0` ekran turu + `.13` görsel kararlar | 30–45 dk; FB-6.1'i kapatan tek şey |
| K20 | BL-255 — ikinci beyaz düğme sistemi (16 ekran) tek sisteme birleşsin mi | önce/sonra görüntüsüyle sorulur |
| K21 | BL-254 (arşivli iş/tip adı) başlasın mı | sıra §3 |
| K23 | Kod denetiminin önerdiği sıranın kalanı (SEC-003'ten sonra): BL-271 → BL-270 + BL-276 → BL-272 + BL-101 → BL-278 + BL-273 → BL-281 | öneri; BL-199 ve BL-218 `.3`'e göre yeri kullanıcı kararı |
| K19 | BL-238 — çok saat dilimli workspace'te hafta ne zaman geçmiş sayılır | uzun konuşulacak |
| K10 | FB-6.3 S4 — onaylı iznin iptalini kim onaylar | uzun konuşulacak |
| K15 | Faturalama (BL-059) S1–S7 | F4 |

**Cevaplı (bugün, kayıtta):** SEC-003 S1 (a) davet kilidi kaldırmaz, S2 (a) "Confirm email" + DB şartı · BL-252 S1 (a) / S2 (b) + ultrareview düzeltmeleri · BL-218 `.5` gruplama · BL-199 sırası (SEC-003'ten sonra) · BL-100 silme (yapıldı) · koordinatör devri (CLAUDE.md kimliği, RC, eski oturum arşivi). Önceki cevaplılar (K1–K6, K8, K9, K11–K14, K16–K18) sürüm 3'te ve BACKLOG/REUSE'da.

## 3. Sıra (tek iş; koordinatör 2026-09-28: değişiklik yok)
1. **SEC-003 hesap güvenliği paketi** (BL-266, BL-267, BL-268, BL-269, BL-274) — sürüyor. `nf-db` (adım 1) → `nf-backend` (adım 2: davet kilidi, parola doğrulama, hassas işlemlerde sunucuda parola, eski silme rotaları, kayıt sonrası "e-postanı doğrula" durumu) → `nf-test` (adım 3: e2e, `enable_confirmations` kararı); gerekirse `nf-arayuz` metni. Birleştirmeden önce kullanıcıya ultrareview önerilir. Bitiş şartlarından biri K22.
2. **BL-265 hosted gönderim** (kod işi değil; koordinatör): SEC-003 bitince önerilir. D1 sayımı → kullanıcı onayı → push → advisors. SEC-003'ün migration'ı da o zamana kadar main'deyse aynı pakete girer.
3. **BL-199** — müdür Schedule'da vardiyaya not yazamıyor (`nf-backend` kaydetme yolu → `nf-arayuz` alan + metin → `nf-test` e2e). Kullanıcı kararı: SEC-003'ten sonra.
4. **BL-218 `.3` → `.5` veri → FB-6.2** — FOUNDATION-B'nin kritik yolu. `.3` (`nf-backend`) FB-6.2 `.4`'ün son önkoşulu; `.5` önce veri (`nf-db` okuma + `nf-backend`), sonra `nf-arayuz` varyantları (Ç9). FB-6.1b `.1` (BL-159) de bu sırada başlayabilir.
5. **K23 sırasındaki denetim işleri**, kullanıcı yerlerini seçince.
6. **BL-238** (K19 konuşulunca) · **K7 ekran turu** (kullanıcının günü; FB-6.1'i %100'e taşır).

## 4. Roller (tek iş kuralıyla sıra listesi)
Kurallar: aynı dosyaya iki rol aynı anda konmaz (CLAUDE.md §4); migration ortak yerel DB'ye yalnız birleştirme penceresinde (`scripts/lock.mjs`); her kod işi `nf-guvenlik`, ekranı değişen `nf-gorsel-qa`.

| Rol | Oturum | Şimdi | Sonra (sırayla) |
|---|---|---|---|
| `nf-db` | `local_0af84e96…` | **SEC-003 adım 1** | BL-218 `.5` veri okuması · FB-6.1b `.1` (BL-159) · FB-6.2 `.1` · BL-254 (K21) · BL-270 + BL-276 (K23) |
| `nf-backend` | `local_cb173b54…` | — | **SEC-003 adım 2** · BL-199 kaydetme yolu · **BL-218 `.3`** · BL-271 (K23; SEC-003'ten sonra, Ç10) |
| `nf-test` | `local_0efbf957…` | — | **SEC-003 adım 3** · BL-199 e2e · BL-262 (yerel kırmızı liste ölçümü) · BL-245 · BL-120 · BL-281 (K23) |
| `nf-arayuz` | `local_6a90e9ce…` | — | SEC-003 metinleri (gerekirse) · BL-199 alan + metin · BL-218 `.4`–`.6` · BL-256..260 · BL-255 (K20) |
| `nf-guvenlik` | `local_8127d370…` | — | her adımın incelemesi (SEC-003: üç adım) |
| `nf-gorsel-qa` | `local_13e7e4de…` | — | ekranı değişen adımlar (SEC-003 kayıt ekranı, BL-199) |
| `nf-planlama` | `local_c67b8d60…` | — | her birleştirmenin kaydı · FB-6.1 kapanış notu (K7'den sonra) |
| Koordinatör | `local_41428574…` | SEC-003 yürütme | BL-265 hosted · K22/K23 soruları · temizlik (§6) |

## 5. Çakışmalar ve sıralama kuralları
- **Ç1 — FB-6.2 Employees ekranı.** `permissions.includes` → `can()` FB-6.2'nin Done when 6'sı; BL-243, BL-244 FB-6.2 diliminde.
- **Ç2 — BL-206 (ölü kod silme)** başlayabilir (BL-198 ve hosted gönderim oldu); BL-280'in ikiz rota ailesiyle birlikte ele alınır.
- **Ç3 — BL-187 FB-6.2 `.6`'da.**
- **Ç4 — Çekirdek sahipliği.** `app_private.authz_check`'e dokunan işler (FB-6.2 `.1`–`.4`, BL-270 + BL-276) aynı anda yazılmaz.
- **Ç5 — Yayın.** Web/API Vercel yayını yapılınca security advisors yeniden koşar; arada main'e giren migration'lar aynı hosted pakete. **Önerim (pre-mortem):** SEC-003 ve denetimin yüksek güvenlik maddeleri (BL-266..270) kapanmadan web/API hosted'da yayına alınmasın.
- **Ç6 — Ortak yerel DB.** Yerel `test:db` taban kırmızısı 18 dosya (`artifacts/koordinator/bl252-red.txt` = `bl221-red.txt`); BL-209, BL-227, BL-245, BL-262 ailesi bilinen yanlış alarm. Birleştirmede "tabandan büyümedi" ölçütü.
- **Ç7 — Bağlam.** Her rol oturumu iş sınırında bağlam doluluğunu söyler; yarıyı geçince devir (CLAUDE.md §11.10, §12).
- **Ç8 — `nf-db` sırası.** SEC-003 adım 1 → BL-218 `.5` veri + FB-6.1b `.1` (BL-159; ikisi de BL-218 `.2`'den sonra, `apply_schedule_template_service` için sırayla) → FB-6.2 `.1` → BL-254 (K21).
- **Ç9 — BL-218 `.5` veri önce.** Çekmecenin iş listesi düz, referans okuması departman ve `system_key` taşımıyor (`tasks/BL-218.md` Notes).
- **Ç10 — SEC-003 ile BL-271 aynı dosya.** İkisi de `apps/web/src/auth/AuthContext.tsx`'e dokunur (SEC-003: kayıt sonrası oturumsuz durum; BL-271: çıkışta önbellek temizliği). BL-271 SEC-003 main'e girdikten sonra.
- **Ç11 — Pazar kuralı** (BL-238 kapanana kadar): Pasifik Pazar 00:00'dan önce main'e kod gönderilmez (HANDOFF §0).

## 6. Temizlik (koordinatör, iş aralarında)
- Dallar ve worktree'ler (ölçüm sürüm 3, 2026-09-28): 43 birleşmemiş görünen yerel dal, 34 worktree; soy ağacı sayımı, içerik farkı ölçülmedi. Her dal içerik farkıyla doğrulanıp silinir.
- Arşiv adayı oturumlar (ListAgents 2026-09-28): eski `nf-db` "BL-198" ve "Settings okumaları" (boşta), "Code review" (denetim kaydı main'de), "ultrareview: bl252" (bulut, BL-252 kapandı). Arşivden önce doğrulanır, kullanıcıya sorulur.
- Kullanıcıda: `../newfork-wt/bl252` boş klasörü; BL-209 onarım komutu; worktree temizlik betiği (HANDOFF §5).

## 7. MVP listesi (kalan, faz sırasıyla)
| Faz | Kalan | Durum | Engel |
|---|---|---|---|
| F0 temel | OPS-010 hosted smoke; SEC-001 (Supabase'ten cevap) | bekliyor | kullanıcı / Supabase |
| FOUNDATION-B | FB-6.1 `.0`/`.13`/`.14`; FB-6.2 … FB-6.8; FB-6.1b; BL-218 `.3`–`.7`; Aşama 7 | ~%58 | K7; tek iş kuralı |
| Güvenlik (kod denetimi 2026-09-28) | SEC-003 (sürüyor); BL-270, BL-271, BL-276 high; BL-272, BL-273 high; orta aileler BL-277..281; düşükler BL-282 | başladı | K22, K23 |
| FJ katılım | JOIN-010, JOIN-007 kalanı; akış 2 "Davet" e2e (FB-6.2'de) | ~%80 | — |
| F1 çekirdek akışlar | UI-DOC-001, BL-038, REQ-AUDIT, BL-048, BL-055; açık high'lar BL-182, BL-127, BL-187 (FB-6.2); BL-199 (sırada) | ~%55 | FOUNDATION-B dilimleri |
| F2 günlük operasyon | ANN-001; Line Up (ayrı proje, MVP'de mi — sorulmadı) | ~%20 | ürün kararı |
| F3 bildirimler | Resend teslimatı, bildirim sistemi yeniden tasarımı, BL-099, BL-101 | ~%20 | FB-6.7 |
| F4 ticari | BL-059 Stripe, BL-034 landing, BL-007/008 (şart) | ~%5 | K15; FOUNDATION-B bitişi |
| F5 cila | BL-193, THEME-003, BL-255..260, BL-249 | ~%30 (tahmin) | K20 |
| F6 lansman | BL-058 beş tenant e2e, REL-001, REL-002; web/API hosted yayını (Ç5) | başlamadı | hepsi |

## 8. Sıra (koordinatöre)
1. SEC-003 adım 1 (`nf-db`) raporu → `nf-guvenlik` → adım 2 (`nf-backend`) → adım 3 (`nf-test`) → birleştirme penceresi (ultrareview önerisi, K22 teyidi).
2. Kullanıcıya tek turda (SEC-003 sürerken, kod yazdırmadan): K22 panel kontrolü, K23 denetim sırasının yeri, K20, K21, K7 günü.
3. BL-265 hosted (SEC-003 bitince).
4. BL-199.
5. BL-218 `.3` → `.5` veri → FB-6.2.
