# BACKLOG-PROGRAM Backlog programı — gruplar ve iş sırası
Status: draft (2026-09-29; `nf-planlama`, koordinatör görevi; tazelik yalnız ilk 3 grupta)
Session: -   Branch: task/backlog-program-planlama   Worktree: -   DB: -
Reviewer: koordinatör (plan); her grup kendi DELEGASYON sınıfına göre incelenir.

Kaynak: kullanıcı kararı 2026-09-29 (koordinatör aktardı): backlog önem sırasına ve birbirine yakınlığa göre gruplanıp sırayla düzeltilecek; her maddenin tazeliği kontrol edilecek; işe başlamadan plan; aynı anda en çok 2 iş, çakışmasız; testler toplu; biten iş kayda geçer. FB-6.2.1 bu program boyunca park (kullanıcı kararı).

Goal: `docs/plan/BACKLOG.md`'deki bütün açık maddeleri gruplara bölmek, grupları önem ve maliyete göre sıralamak, aynı anda koşabilecek ikilileri ve toplu test turlarını belirlemek. Koordinatör işleri bu sırayla dağıtır.

In scope: açık maddelerin ("Kapanan maddeler" başlığının üstü, numarasızlar dahil) gruplanması; sıra ve gerekçe; karar bekleyenlerin soruları; bayat görünenlerin işaretlenmesi; ilk 3 grubun tazeliği (BACKLOG.md'de maddelerin altında); toplu test turları; BL-332 ve BL-333.

Out of scope: kod değişikliği; madde düzeltme; G4 ve sonrasının tazeliği (sırası gelince); CLAUDE.md.

Done when:
1. Her açık madde tam bir grupta (sayım aşağıda, betikle doğrulandı).
2. İlk 3 grubun (G1, G2, G3) tazelik hükümleri BACKLOG.md'de maddelerin altında.
3. BL-332 ve BL-333 BACKLOG.md'de.
4. ILERLEME-PLANI.md'de "Backlog programı (2026-09-29)" bölümü.

Touches: yalnız `docs/plan/**`.

Test plan: kod yok. Sayım betikle yapıldı: açık madde listesi `BACKLOG.md` satır 1–414'ten çıkarıldı, her madde kimliği gruplarda bir kez sayıldı (kopya 0, eksik 0, fazla 0).

Risk:
- **Stil B ile çakışma.** G1 ve G14, kullanıcının açtığı tasarım oturumunun ("Schedule modals UI design mockups", dal `task/schedule-dialog-mockups`) değiştirdiği pencerelere dokunuyor. Koordinatör G1'i o dalla birlikte ya da o main'e girdikten sonra başlatmalı; G14 kesin olarak sonra.
- **G7 ile FB-6.2 örtüşmesi.** Yetki ailesi A, park edilen FB-6.2'nin konusu. Program G7'yi kendi başına yürütürse FB-6.2 açıldığında aynı dosyalar yeniden açılır; koordinatör G7'yi FB-6.2.1'in yerine mi koyacağını seçmeli.
- **Bayat maddeler sırada yer tutar.** Tazelik yalnız ilk 3 grupta yapıldı; sonraki gruplarda bir kısmı bayat çıkabilir (aşağıdaki "Bayat görünenler"). Her grup başlamadan önce ölçülür (CLAUDE.md §5 adım 0).

## Sayım (2026-09-29, `origin/main` `3a31d625`)
- Açık madde: **286** (numaralı 220, numarasız 66) + yeni BL-332 ve BL-333 = **288**.
- Gruplardaki madde toplamı: **288**. Kopya 0, eksik 0, fazla 0.
- Numarasız maddelere bu dosyada `U01`…`U66` takma adı verildi (BACKLOG.md'deki sırayla, açık bölümde yukarıdan aşağı). Kalıcı numara verilmedi; G0 onları ya kapatır ya numaralar.
- İki numara açık bölümde iki kez geçiyor: BL-070 (satır 116 madde, satır 194 bağlantı notu) ve BL-091 (satır 136 kapanmış satır, satır 195 bağlantı notu). İkisi de ayrı satır olarak sayıldı; notlar G0'da.

## İş sırası
Sıralama kuralı: önce en yüksek "leave" (critical yok; high); aynı önemde ucuz ve güvenli (do: safe) öne; bağımlılık korunur. Karar bekleyen, FOUNDATION-B'ye bağlı, yol haritası ve MVP sonrası grupları sıraya girmez (aşağıda). G0 sıradan bağımsızdır, her an paralel koşar.

| Sıra | Grup | Tema | Maddeler | En yüksek leave / do | Risk sınıfı | Yazacak rol | Süre (tahmin) | Paralel koşabilir |
|---|---|---|---|---|---|---|---|---|
| 1 | **G1** | Schedule taslak ve yayın pencereleri — davranış hataları | BL-299 BL-300 BL-301 BL-302 BL-303 BL-306 BL-310 BL-323 BL-181 BL-329 BL-313 BL-108 | high / safe | R1 (BL-302 ekranda izin gösterimi; veri sözleşmesi değişmez) | `nf-arayuz` | 1 gün | G2 |
| 2 | **G2** | Schedule hızlı düzenleyici — alanlar ve klavye odağı | BL-293 BL-290 BL-294 BL-295 BL-291 | high / safe | R1 | `nf-arayuz` | 0,5 gün | G1, G3 |
| 3 | **G3** | Bayat ekranlar ve ekran önbelleği | BL-271 BL-273 BL-278 BL-149 BL-152 | high / safe | R2 (birden çok ekranın veri katmanı; BL-271 oturum) | `nf-backend` | 1 gün | G2, G4 |
| 4 | **G4** | Zamanlanmış dışa aktarma ve e-posta teslimatı | BL-101 BL-272 BL-157 BL-225 BL-163 U63 | high / moderate | R3 (BL-101 yetki çekirdeğine dokunuyor; belirsiz → üst sınıf) | `nf-backend` + `nf-db` | 1–1,5 gün | G3 |
| 5 | **G5** | Parola, oturum ve hesap güvenliği | BL-283 BL-162 BL-161 BL-279 | high / moderate | R3 (parola/oturum) | `nf-db` + `nf-backend` | 1,5 gün | G14 |
| 6 | **G6** | Bildirim teslimi | BL-099 BL-119 | high / moderate | R3 (bildirim `*_service`) | `nf-db` | 0,5 gün | G13 |
| 7 | **G7** | Yetki çekirdeği ailesi A (rütbe, eski kapı, UI izin anahtarı) | BL-270 BL-276 BL-179 BL-189 BL-155 BL-224 BL-242 BL-261 BL-264 BL-129 BL-130 BL-133 BL-176 BL-243 BL-178 BL-232 BL-071 | high / risky | R3 | `nf-db` (+ `nf-backend` BL-176/BL-232/BL-243) | 3–4 gün | G14, G11 |
| 8 | **G8** | Silinmiş ve arşivli kayıtlar | BL-188 BL-254 BL-132 | high / risky | R3 | `nf-db` (+ `nf-backend` okuma modeli) | 1 gün | G14 |
| 9 | **G9** | İzin, takas ve kapsam kuralları | BL-127 BL-182 BL-183 BL-220 BL-247 BL-200 BL-110 BL-109 BL-185 | high / risky | R3 | `nf-db` (+ `nf-arayuz` BL-185 metni) | 2 gün | G14 |
| 10 | **G10** | Schedule kayıt ve yayın kuralları (veri) | BL-174 BL-190 BL-191 BL-326 BL-325 BL-164 BL-167 BL-228 BL-229 BL-292 BL-298 BL-236 BL-211 | medium / moderate | R3 (`*_service` sözleşmesi, BL-292) | `nf-db` (+ `nf-backend` BL-298 shared şema) | 2 gün | G13 |
| 11 | **G11** | Hata sözleşmesi ve hata görünürlüğü | BL-134 BL-223 BL-172 BL-145 BL-156 BL-193 BL-213 BL-331 BL-324 BL-076 U31 U26 U37 U55 U51 | medium / moderate | R2 | `nf-backend` | 2 gün | G7 |
| 12 | **G12** | Yerel veritabanına dayanıklı pgTAP | BL-209 BL-217 BL-227 BL-245 BL-262 BL-288 BL-296 BL-173 BL-105 BL-226 BL-253 BL-248 BL-094 BL-070 BL-096 U32 | medium / safe (BL-070 high, bayat görünüyor) | R0 (yalnız test) | `nf-test` | 1,5 gün | G1–G3 ile (dosyaca ayrık) |
| 13 | **G13** | Web ve e2e test kararlılığı, CI bekçileri | BL-120 BL-175 BL-321 BL-322 BL-195 BL-202 BL-203 BL-210 BL-328 BL-281 BL-196 U12 U16 U18 U19 U36 | medium / safe | R0 (test, CI) | `nf-test` | 1,5 gün | G6, G10 |
| 14 | **G14** | Schedule üst çubuk, menüler ve pencereler — görsel | BL-305 BL-307 BL-308 BL-311 BL-312 BL-319 BL-320 BL-327 BL-333 BL-233 BL-204 BL-332 U08 | medium / safe | R1/R2 (birden çok Schedule yüzeyi) | `nf-arayuz` | 1 gün | G5, G7 |
| 15 | **G15** | Görsel tutarlılık: ham hex, beyaz düğme, onay pencereleri | BL-256 BL-257 BL-258 BL-259 BL-260 BL-194 BL-287 BL-215 BL-154 BL-241 BL-249 U21 U29 U30 U39 U40 U41 | medium / moderate | R2 (birden çok ekran) | `nf-arayuz` | 2 gün | G6 |
| 16 | **G16** | Giriş öncesi, hesap ve workspace ekranları | BL-285 BL-289 BL-286 BL-144 BL-151 BL-122 BL-072 BL-284 U48 U49 U53 U54 U56 U57 U58 | medium / safe | R1 (BL-284, K24 cevabına göre R3 olabilir) | `nf-arayuz` (+ `nf-backend` U56/U57/BL-284) | 1,5 gün | G10 |
| 17 | **G17** | Çalışanlar ve kişi kaydı | BL-314 BL-315 BL-244 BL-079 BL-153 | medium / risky | R3 (BL-079 görünen adın tek kaynağı) | `nf-db` + `nf-backend` | 1,5 gün | G15 |
| 18 | **G18** | Belgeler (Documents) | U59 U60 U43 U44 BL-118 | medium / moderate | R2 | `nf-backend` + `nf-arayuz` | 1 gün | G12 |
| 19 | **G19** | Zaman ve tarih | BL-277 | medium / safe | R2 | `nf-backend` | 0,5 gün | G12 |
| 20 | **G20** | Performans | BL-275 U13 U20 | medium / moderate | R2 | `nf-arayuz` + `nf-backend` | 1 gün | G12 |
| 21 | **G21** | Müsaitlik | BL-135 BL-086 | medium / safe | R2 | `nf-backend` + `nf-arayuz` | 1 gün | G13 |
| 22 | **G22** | İpucu ve not köşesi | BL-207 BL-297 | low / moderate | R2 (ortak Tooltip) | `nf-arayuz` | 0,5 gün | G12 |
| 23 | **G23** | Ölü kod ve ikiz yollar | BL-280 BL-282 BL-168 BL-206 U14 U15 | medium / moderate | R2 | `nf-backend` | 1 gün | G12 |
| 24 | **G24** | Geliştirme ortamı ve araçlar | BL-002 BL-003 BL-083 BL-304 BL-125 U04 U07 U17 U25 U38 U45 U47 U64 | medium / moderate | R0/R1 | koordinatör + `nf-test` | 1 gün | her grupla (kod dosyası paylaşmaz) |
| — | **G0** | Kayıt bakımı: açık listede duran kapanmış satırlar ve notlar | U01 BL-004 BL-061 U09 U10 U22 U23 U24 U33 U34 U62 BL-081 BL-082 BL-084 BL-085 BL-087 BL-089 BL-091 BL-114 BL-116 BL-070 (satır 194) BL-091 (satır 195) BL-097 BL-137 U11 U27 U28 U35 U50 U52 U61 U65 U66 | low / safe | R0 | `nf-planlama` | 0,5 gün | her grupla (yalnız docs) |

**Satırın anlamı:** "Maddeler" o grubun iş listesi; "Paralel koşabilir" dosyaca çakışmayan grup. Aynı anda en çok 2 grup koşar.

### Dokunduğu dosyalar, bağımlılık ve sıra gerekçesi
| Grup | Dokunduğu dizin / dosyalar | Bağımlılık | Gerekçe (tek satır) |
|---|---|---|---|
| G1 | `apps/web/src/schedule/components/{PublishScheduleDialog,UnpublishScheduleDialog,DraftDropdownMenu,SaveDraftMenu}.tsx`, `apps/web/src/views/SchedulePage.tsx` (CSS yok) | Stil B oturumu ("Schedule modals UI design mockups", dal `task/schedule-dialog-mockups`) aynı pencerelere dokunuyor: G1 ya onun dalında ya o main'e girince | En yüksek "leave" ve ucuz: BL-299 yanlış taslağı yayınlıyor, BL-300 klavyeyle çalışmıyor; hepsi aynı beş dosyada. |
| G2 | `apps/web/src/styles.css` (hızlı düzenleyici kuralları), `apps/web/src/schedule/components/ShiftQuickEditor.tsx`, `TimeInput.tsx` | yok | BL-293 WCAG 2.4.7 ihlali (doğrulandı); beşi aynı CSS bloğunda, yarım günlük iş. |
| G3 | `apps/web/src/auth/{AuthContext.tsx,tenant-query-cache.ts}`, `*-data.ts`, `ScheduleRequestsPage.tsx`, `EmployeeDrawer.tsx`, `EmployeeDashboard.tsx`, `WorkspacesPage.tsx`, `SchedulePage.tsx` (BL-278'in iki kalemi) | G1'den sonra (ikisi `SchedulePage.tsx`'e dokunuyor) | BL-271 ortak tablette öncekinin telefonunu gösteriyor (gizlilik), BL-273 izin kararından sonra Schedule eski kalıyor; ikisi ucuz. |
| G4 | `apps/api/src/schedule/{schedule-export*.ts,schedule-service.ts}`, `packages/shared/src/index.ts`, `vercel.json`, yeni migration | yok (U63: hosted e-posta sağlayıcısı kullanıcıda) | Zamanlanmış dışa aktarma bugün hiç çalışmıyor (BL-101) ve tek bozuk saat dilimi herkesi durduruyor (BL-272). |
| G5 | `apps/api/src/auth/verify-password.ts`, `apps/api/src/account/*`, `supabase/config.toml`, yeni migration | BL-161'in hosted kısmı kullanıcıda | BL-283 yayın öncesi şart (kullanıcı kararı 2026-09-28); aynı dosyalarda üç hesap güvenliği maddesi daha. |
| G6 | `supabase/migrations` (outbox/policy), `supabase/tests/preferred_name_approval.test.sql` | yok | Tercih edilen ad bildirimi kimseye ulaşmıyor; küçük, test onu kilitler. |
| G7 | `supabase/migrations`, `supabase/tests/authorization_*`, `apps/web/src/auth/PermissionRoute.tsx`, `apps/web/src/settings/organization-data.ts` | FB-6.2 (izin/RLS) ile büyük örtüşme; FB-6.2.1 bu program boyunca park (kullanıcı kararı). G7, FB-6.2'nin ilk adımı gibi yürüyebilir ya da onunla birleşir; koordinatör seçer | İki high/risky açık (admin başka admin'in erişimini kaldırıyor; eski kapı rütbeyi atlıyor). Pahalı ve riskli, bu yüzden ucuz high'lardan sonra. |
| G8 | `supabase/migrations` (şablon, dışa aktarma kuralları, okuma modeli), `apps/web/src/schedule/hooks/*`, `export-v2/snapshot.ts` | G4'ten sonra (BL-157/BL-225 aynı dışa aktarma kuralları) | BL-188 (Templates → Rename kendini geri alıyor) karar verilmiş bir high; BL-254'ün kararı (K8) hazır. |
| G9 | `supabase/migrations` (izin, takas), `apps/api/src/shift-exchanges/*`, Settings → Conflict handling metni | FB-6.3 (İzin) ve K10 ile örtüşür; BL-127/BL-182 kuralları KARARLAR'da hazır | Kararı verilmiş iki high/risky ("izni kısalt ve ata"; çalışan kendi iznini ezebilir) ve BL-183 ailesi. |
| G10 | `supabase/migrations` (düzenleme/yayın servisleri), `supabase/tests/shift_note_*`, `packages/shared/src/index.ts` | G8'den sonra (aynı migration ailesi) | Sessiz veri kaybı riski (BL-292) ve yayın tetikleyicisi boşlukları; hepsi aynı servis ailesinde. |
| G11 | `apps/api/src/**` rota ve servisleri, `apps/web` hata yardımcıları | yok | 12 servis ham veritabanı hatası gösteriyor (BL-134 ailesi); ekranda ham zod hatası (BL-193). |
| G12 | `supabase/tests/**` | BL-209 onarım komutu kullanıcıda | Yerel kırmızılar birleştirme penceresinde gerçek kırmızıyı gizliyor; ucuz, yalnız test. |
| G13 | `apps/web/src/**/*.test.ts(x)`, `e2e/**`, `.github/workflows/ci.yml`, `scripts/lock.mjs` | yok | Yük altında yanlış kırmızı veren testler main'i boşuna durduruyor. |
| G14 | `apps/web/src/styles.css` (Schedule üst çubuk ve pencere kuralları), aynı pencere bileşenleri | Stil B oturumu main'e girdikten sonra (aynı pencereler); BL-332 koordinatör dalında, toplu turda girer | Stil B ile çakışmasın diye G1'den ayrıldı; kontrast (BL-307) ve telefonda taşma (BL-333) burada. |
| G15 | `apps/web/src/styles.css`, sayfa CSS'leri (`settings/*.css`, `views/requests-catalog.css`, `account/*.css`) | K20 (BL-255) cevabı beyaz düğme kısmını etkiler | KARARLAR UI-09 ve UI-13 kuralları hazır; kural var, yalnız uygulanmamış. |
| G16 | `apps/web/src/shell/prebiz/*`, `apps/web/src/views/{SignInPage,ForgotPasswordPage}.tsx`, `apps/web/src/account/*` | K24 (BL-284) | Kayıt olan kişinin ilk gördüğü ekranlar; küçük ve güvenli. |
| G17 | `supabase/migrations` (çalışan kaydı), `apps/web/src/employees/*`, `scheduleEmployeeSort.ts` | BL-317 kararı (Karar grubu) aynı ekranda | Görünen adın iki kaynağı (BL-079) kişiyi yanlış adla gösterebilir. |
| G18 | `DocumentReviewDrawer` ve belge rotaları | yok | U59 bir hata (yükleme sonrası çekmece yeniden kuruluyor); 8 mutasyon testsiz (U60). |
| G19 | `apps/web/src/lib` (tarih yardımcısı) ve birkaç ekran | API tarafı K19'a bağlı (BL-238); bu madde beklemez | "Bugün" üç ayrı yoldan hesaplanıyor; tek yardımcıya bağlamak ucuz. |
| G20 | `apps/web/src/views/SchedulePage.tsx`, `export-v2/*` | G1 ve G3'ten sonra (`SchedulePage.tsx`) | Izgara her çizimde bütün modeli yeniden kuruyor (≤50 ms çıtası, CLAUDE.md §9). |
| G21 | Availability ekranı ve servisleri | yok | "Manager note" kararı hazır; ölü haftalık yollar aynı yerde. |
| G22 | `apps/web/src/shell/Tooltip.tsx`, `apps/web/src/schedule/components/ShiftNoteCorner.tsx` | G2'den sonra | Aynı zamanlayıcı mantığı iki kez yazılı; takılı kalan basılı durum aynı dosyada. |
| G23 | `apps/api/src/**` (ikiz rotalar), `apps/web/src/schedule/schedule-data.ts`, lazy import'lar | G11'den sonra (aynı rota dosyaları) | CLAUDE.md §9 "ikiz sistem yok"; ölü yollar yanlış güven veriyor. |
| G24 | `scripts/**`, `README.md`, `supabase/seed.sql`, `package.json` | U17/U25 kullanıcının makinesinde | Kullanıcıyı etkilemez; geliştirici zamanını yer. Sona. |
| G0 | `docs/plan/BACKLOG.md`, `docs/plan/KARARLAR.md` | yok | Sıradan bağımsız: açık listeyi gerçek iş sayısına indirir; her an paralel koşabilir. |

## Toplu test turları (her iş sonrası değil, tur sonunda)
Her tur: `pnpm.cmd lint`, `typecheck`, `test`, `build`; turda migration varsa `test:db` (yerel taban kırmızısından büyümeden); ekranı değişen akışların e2e'si (`db.lock`). Tur yeşilse turdaki gruplar main'e birlikte girer.

| Tur | Gruplar | Ek kapı |
|---|---|---|
| T1 | G1 + G2 (+ G0 docs) | e2e: Schedule (`e2e/flows/schedule-*.spec.ts`); ekran görüntüsü masaüstü + telefon (R1) |
| T2 | G3 + G4 | `test:db` (G4 migration); e2e: Schedule, Requests, Account; `nf-guvenlik` (G4 R3) |
| T3 | G5 + G14 | `test:db`; e2e: giriş/Account, Schedule; `nf-guvenlik` (G5 R3); stil B main'de olmalı |
| T4 | G6 + G12 | `test:db` (G12 yalnız test dosyası); `nf-guvenlik` (G6 R3) |
| T5 | G7 (tek başına) | `test:db` + yetki matrisi; e2e: izin gerektiren akışlar; `nf-guvenlik` zorunlu, `/code-review` ve kullanıcıya ultrareview önerisi |
| T6 | G8 + G13 | `test:db`; e2e: Templates, dışa aktarma |
| T7 | G9 + G15 | `test:db`; e2e: izin, takas; görsel QA (G15 çok ekran) |
| T8 | G10 + G16 | `test:db`; e2e: Schedule kayıt/yayın, giriş |
| T9 | G11 + G17 | `test:db`; e2e: Employees |
| T10 | G18 + G19, sonra G20 + G21, sonra G22 + G23, en son G24 | tur başına tam kapı |

## Karar bekleyen (GK) — kullanıcıya sorulacaklar, tek tıklık
Önerilen seçenek ilk sırada. Cevap gelince madde parantezdeki gruba geçer.
- **BL-238 (K19)** — Birden çok saat dilimli workspace'te "bu hafta" ne zaman biter? Bugün sunucu UTC'ye bakıyor; Pazar akşamı Pasifik'te yönetici haftayı düzenleyemiyor.
  - (a) Her lokasyonun kendi saat dilimi **(Önerilen)** — yönetici hangi lokasyondaysa onun Pazar gece yarısı
  - (b) Workspace'in tek saat dilimi
  - (c) UTC kalsın, ekranda uyarı
  - Cevaptan sonra: G10.
- **BL-255 (K20)** — İkinci beyaz düğme sistemi (`.job-secondary-button`) ortak beyaz düğmeye birleşsin mi? 16 ekranın görünümü değişir.
  - (a) Evet, önce/sonra görüntüsüyle onaydan sonra **(Önerilen)**
  - (b) Hayır, iki görünüm kalsın
  - Cevaptan sonra: G15.
- **BL-309** — Yayındaki programın hangi taslaktan geldiği web'e gelmiyor; menülerdeki kod ölü.
  - (a) Ölü dallar silinsin, menüde "Published schedule" yazsın **(Önerilen)** — ucuz, R1
  - (b) API kaynak taslağı döndürsün — sözleşme + veritabanı, R3
  - Cevaptan sonra: G1.
- **BL-318** — Schedule'ın diğer pencereleri de sade stile (stil B) geçsin mi?
  - (a) Evet, stil B main'e girince tek tutarlılık işi olarak **(Önerilen)**
  - (b) Hayır, yalnız dört pencere
  - Cevaptan sonra: G14.
- **BL-317** — Workspace sahibi (owner) Employees listesinde görünsün mü? KARARLAR owner'ı çalışan sayıyor ama listede görünmesini açıkça söyleyen satır yok.
  - (a) Evet, listeyi görebilen herkes görür **(Önerilen)**
  - (b) Yalnız owner ve admin görür
  - (c) Görünmez
  - Cevaptan sonra: G17.
- **BL-330** — Zamanlanmış dışa aktarma, "include notes" açıksa vardiya notlarını yöneticinin yazdığı herhangi bir e-posta adresine götürüyor.
  - (a) Zamanlanmış dışa aktarmada notlar hiç gitmesin (elle indirmede kalsın) **(Önerilen)** — kişisel bilgi e-postayla dışarı çıkmaz
  - (b) Bugünkü gibi kalsın (yöneticinin kendi seçimi)
  - (c) Yalnız workspace'te yönetici olan adreslere notlu gitsin
  - Cevaptan sonra: G4.
- **BL-121** — Yayın önizlemesinde kişi başı haftalık saat özeti ve 40 saat eşiği olsun mu?
  - (a) Evet, ayrı iş olarak **(Önerilen)** — ABD'de 40 saat fazla mesai sınırı
  - (b) MVP sonrası
  - Cevaptan sonra: G10.
- **BL-073** — Hesap düğmesi ile workspace değiştirici tek kontrol olsun mu (canvas önerisi)?
  - (a) Ekran turunda (K7) canvas görseliyle gösterilsin, karar orada **(Önerilen)**
  - (b) Hayır
  - Cevaptan sonra: G16.
- **BL-088** — Müsaitlik modu dönüşümü, bekleyen istekleri işaretlesin mi?
  - (a) Evet, dönüşüm bekleyen istekleri yöneticiye işaretler **(Önerilen)**
  - (b) Hayır
  - Cevaptan sonra: G21.
- **BL-126** — Taslakta lokasyonlar arası ortak çalışma daveti olsun mu?
  - (a) MVP sonrası **(Önerilen)**
  - (b) Şimdi (yetki, realtime ve taslak kilidini etkiler)
  - Cevaptan sonra: GS.
- **BL-147** — Account alanlarında yardım satırı olan alanın yanındaki kutu ~15px kayıyor. Düzeltme ortak form hizası kuralını değiştirir.
  - (a) Hizalama kuralı yazılsın, etkilenen ekranlar listelensin, tek işte düzeltilsin **(Önerilen)**
  - (b) Yalnız Account'ta düzelt
  - Cevaptan sonra: G15.
- **BL-169** — Ortak durum mesajları (`.form-error`, `.settings-notice`, `.request-notice`) ham renk kodu kullanıyor; token'a geçmek birçok ekranın rengini az da olsa değiştirir.
  - (a) Token'a geçilsin, önce/sonra görüntüsüyle **(Önerilen)**
  - (b) Olduğu gibi kalsın
  - Cevaptan sonra: G15.
- **U42 (P1)** — Kiosk (4.106 satır, 7 canlı rota) ve Time Entries (1.569 satır) kodu MVP kapsamı dışında ama canlı rotaları var.
  - (a) Sil **(Önerilen)** — kapsam dışı (ROADMAP), güvenlik yüzeyi küçülür
  - (b) Kalsın, güvenlik yüzeyi sahiplenilsin
  - Cevaptan sonra: G23.
- **U46** — `eslint-plugin-react-hooks` kurulsun mu? Yeni bağımlılık (CLAUDE.md §8); kurulunca 20 uyarı gerçekten denetlenir.
  - (a) Evet, uyarılar aynı işte düzeltilir **(Önerilen)**
  - (b) Hayır
  - Cevaptan sonra: G13.

## Bu programda yürümeyen gruplar
- **GF — FOUNDATION-B planına bağlı (bu programda yürümez):** BL-187 BL-218 BL-159. Zaten FOUNDATION-B adımlarına bağlandı; ILERLEME'den yürür.
- **GY — Yol haritası fazları ve duraklatılmış programlar (bu programda yürümez):** BL-007 BL-008 BL-027 BL-034 BL-038 BL-041 BL-042 BL-043 BL-044 BL-045 BL-046 BL-047 BL-048 BL-051 BL-053 BL-054 BL-055 BL-056 BL-057 BL-058 BL-059 BL-067 BL-117 U02 U03. Faz sırası kullanıcı kararı olmadan değişmez (CLAUDE.md §1).
- **GS — MVP sonrası (bu programda yürümez):** BL-009 BL-030 BL-060 BL-062 BL-050 BL-123 U05 U06. Kapsam dışı (ROADMAP "Kapsam kararları").

## Bayat görünenler (sırası gelince doğrulanır; G0'dakiler hariç)
- **BL-137** (giriş ekranında "Forgot password" yok): **bayat, kanıtlı** — `apps/web/src/views/SignInPage.tsx:146` bağlantı, `apps/web/src/App.tsx:163` rota; SEC-003 ile geldi. G0'a alındı, kapanışı G0 yazar.
- **BL-070 / BL-096** (pgTAP paketi, ilk fixture satırında duran dosyalar): FOUNDATION-B Aşama 1 CI kapısı ve `ci-green.txt` sonrası bayat olabilir (G12).
- **BL-190** (yayın uyarı gerekçesi ölü): metni "BL-186 kapsamına alındı, onunla birlikte kapanır" diyor; BL-186 2026-09-27'de kapandı (G10).
- **BL-154** (ghost kart kontrastı): karar 2026-09-26'da verildi, uygulama dalının adı geçiyor; birleşmiş olabilir (G15).
- **U54** (kurulumu bitmemiş workspace'i Discard için yeniden kimlik doğrulama): SEC-003 ile kurulumu bitmemiş workspace parolasız kapanıyor (BL-284); şekli değişmiş olabilir (G16).
- **U28** (Vercel Authentication yeniden açılacak): BL-082 "kullanıcı yeniden açtı" diye kapanmış (G0).
- **U35** (main CI THEME-004'ten beri kırmızı): 2026-09-16 notu, çoktan düzeldi (G0).

## İlk 3 grubun tazeliği (2026-09-29, `origin/main` `3a31d625`, kod okuması)
Hükümler BACKLOG.md'de maddelerin altında ("Tazelik 2026-09-29 (`3a31d625`, program G…)"). Uygulama çalıştırılmadı; klavye, iOS ve tarayıcı davranışı gereken yerler "ölçülmedi" diye yazıldı.
- **G1:** 12 maddenin 11'i geçerli, BL-303 değişmiş (yenileme artık kısmen yapılıyor; kalan hata: pencere kapandıktan sonra gelen hata görünmüyor). Bayat yok. Tazelikte ek: BL-181'in kök nedeni koddan bulundu; BL-329'daki Escape hatası Unpublish penceresinde de var.
- **G2:** 5 maddenin 5'i geçerli; eski dal satırları kaydığı için bugünkü satırlar yazıldı. Tazelikte ek: Start/End kenarı da soluk ham renk (BL-290); düzenleyici, yeşil odak kuralını taşıyan pencere işaretini (`data-schedule-quiet-dialog`) almıyor (BL-293).
- **G3:** 5 maddenin 5'i geçerli. BL-278'in 8 alt kaleminden 7'si aynen, 1'i kısmen değişmiş (Workspace sayfası hata cümlesi göstermiyor ama sayacı sessizce 0 yapıyor). Bayat yok.

## Notes / Result
- 2026-09-29: taslak `nf-planlama`. Gruplama, BACKLOG.md'den betikle çıkarılan özet dizinden (kimlik, işaret, başlık, anılan dosyalar) ve karar içeren maddelerde ilgili cümleden yapıldı; 298 KB'lık dosya baştan sona okunmadı. İlk 3 grubun tazeliği üç salt okur alt ajanla ölçüldü; `nf-planlama` hükümleri gözden geçirip BACKLOG.md'ye yazdı.

## Ek: numarasız maddelerin takma adları
Satır numaraları `3a31d625` anındaki BACKLOG.md'ye göre; metnin başı aramak için.

| Takma ad | Satır | Grup | Metnin başı |
|---|---|---|---|
| U01 | 13 | G0 | BL-040 Line Up sadeleştirme. KAPANDI 2026-09-24: Line Up FOUNDATION-B 5.6'da silindi;  |
| U02 | 31 | GY | OBS-001 Invite/access mutasyonları (reminder/revoke/remove access) ve provider kabulü → ta |
| U03 | 32 | GY | OBS-002 Availability save → manager → Schedule browser zinciri ve otomatik bildirim (local |
| U04 | 38 | G24 | Genel seed/SQL replay hataları (release öncesi). |
| U05 | 47 | GS | Export iyileştirme fikirleri: somut kullanıcı feedback'i bekleniyor. |
| U06 | 48 | GS | Eski toplu fikir grupları (BL-010..025: dashboard'lar, raporlar, mobil, enterprise, termin |
| U07 | 51 | G24 | README.md eski içerik taşıyor (payroll/kiosk fazları); rescue'da silinmişti, geri tutuldu. |
| U08 | 52 | G14 | Schedule topbar dar pane'de (~936px) iki satıra sarıyor; taşma yok, polish (F5). |
| U09 | 53 | G0 | Schedule topbar filtre çipleri Settings dropdown'ının üstünde render ediliyor (z-index)  |
| U10 | 54 | G0 | Light tema token seti → tasks/THEME-002. KAPANDI 2026-09-16 (THEME-002). |
| U11 | 55 | G0 | ≤760px'te Schedule Export erişilemiyor → KARAR (2026-09-16): mobilde export yok; mevcut da |
| U12 | 56 | G13 | App.test.tsx schedule-data mock'u scheduleReadKey'i gerçek koddan farklı (view dahil) üret |
| U13 | 57 | G20 | Export PNG önizlemesi her sayfayı 2.5x ölçekte render ediyor; çok sayfalı haftalarda yavaş |
| U14 | 58 | G23 | Prod build'e erişilemeyen lazy chunk'lar giriyor (ScheduleShiftBadgeLab, Kiosk, TimeEntrie |
| U15 | 59 | G23 | EmployeeHubPage pageCopy'de time-tracking metni ve independentPage mantığı duruyor (BL-057 |
| U16 | 60 | G13 | ScheduleExportSchedules.test.tsx makine TZ'sine bağlı; testte TZ'yi mock'la (CI şu an TZ p |
| U17 | 61 | G24 | Kullanıcı dizinindeki C:/Users/TheWe/node_modules (ör. @types/node 25.5) repo bağımlılıkla |
| U18 | 62 | G13 | CI test adımı ~7dk (concurrency=1); ileride concurrency=2 denensin. |
| U19 | 63 | G13 | Tam local pnpm test'te yük altında flaky testler: api organization-settings-routes, web Em |
| U20 | 64 | G20 | EXP-002: export çıktı görünümünün kalanı (PNG önizleme ölçeği + kullanıcı geri bildirimi); |
| U21 | 65 | G15 | (leave: low / do: moderate) THEME-003 (MVP-PLAN F5): (1) yakın renk tonlarını (ΔE<4) THEME |
| U22 | 66 | G0 | THEME-002 açıkları → tasks/THEME-004 (sayfa CSS token'ları, on-accent, employee AA). Yak |
| U23 | 67 | G0 | Owner onboarding'de lokasyon short name önerisi ve phone alanı yok → tasks/LOC-002. KA |
| U24 | 68 | G0 | Hosted'a location_phone migration'ı → tasks/LOC-002 (publication migration'ı UI-DOC-001  |
| U25 | 69 | G24 | Supabase CLI v2.109 → v2.117 güncellemesi (db push sırasında pg-delta sertifika ENOENT gür |
| U26 | 70 | G11 | /v1/invitations/pending |
| U27 | 71 | G0 | T2 madde 6 (davet token'ını sessionStorage'da saklama) YAGNI ile düşürüldü; hosted'da e-po |
| U28 | 72 | G0 | Vercel Authentication (newfork-clean-api, Production) smoke bitince yeniden açılacak (memo |
| U29 | 73 | G15 | .employee-remove-access { color: #9b3442 } (styles.css ~2359) ölü kural: "Remove access" k |
| U30 | 74 | G15 | SecurityPage "Cancel change" butonu kırmızı (danger) görünüyor; iptal eylemi için doğru to |
| U31 | 75 | G11 | Onboarding getter geçersiz ya da erişilemeyen workspaceId için "unavailable" (P0002) veriy |
| U32 | 76 | G12 | pgTAP borcu: BL-052 sonrası üç onboarding/document test dosyası kırmızı; employee_onboardi |
| U33 | 77 | G0 | .workspace-row capitalize hatası KAPANDI: kural UI-PRE-001 D1'de silindi (6d9f0e7). |
| U34 | 78 | G0 | Pending başlığının yüklenirken görünmesi KAPANDI: kit yükleme durumunda "Checking your |
| U35 | 79 | G0 | main CI THEME-004'ten beri kırmızıydı: MainNavigationHeaderContract.test.ts eski --lu-mute |
| U36 | 80 | G13 | CI: .github/workflows/ci.yml yalnız docs/** değişen push'larda tetiklenmesin (paths-ignore |
| U37 | 81 | G11 | POST /owner-onboarding/invitation-intents body'yi yetkiden önce doğruluyor (yetkisiz + geç |
| U38 | 82 | G24 | Local DB kalıntısı (AUTH-UX-001 fixture'ları, 2026-09-17 kısmi temizlik): "AUTH-UX Bistro" |
| U39 | 83 | G15 | (leave: low / do: moderate) Uygulamada kendi elle yazılmış onay pencereleri hâlâ var; orta |
| U40 | 84 | G15 | (leave: low / do: moderate) Roles > rol silme hâlâ kendi iki tık kopyasını kullanıyor (Rol |
| U41 | 85 | G15 | (leave: low / do: safe) Workspace ana sayfasındaki "Customize" ve "Add" butonları secondar |
| U42 | 86 | GK | Teknik borç denetimi (2026-09-18, salt okunur; ayrıntı DEBT-001 ve o session'ın transcript |
| U43 | 92 | G18 | Documents: migration öncesi published kayıtların published_at'i null; listede "-" görünüyo |
| U44 | 93 | G18 | Documents: DB trigger'ı published tanımın düzenlenmesini reddediyor; drawer bu yüzden salt |
| U45 | 94 | G24 | exceljs@4.4.0 > uuid@8.3.2 moderate advisory: exceljs yalnız uuid.v4 kullandığı için istis |
| U46 | 95 | GK | eslint-plugin-react-hooks kurulumu kullanıcı onayı bekliyor: kurulunca exhaustive-deps ilk |
| U47 | 96 | G24 | supabase/seed.sql:143 "Pending Demo" üyeliği pending_activation ama employee_onboarding_ca |
| U48 | 97 | G16 | UI-PRE-001 backlog'u (aynı tasarım diliyle, sonra): /sign-in kayıt modu ve sonlanan oturum |
| U49 | 98 | G16 | Yeni taslak business'ın varsayılan adı "New organization" (CreateOrganizationButton.tsx:15 |
| U50 | 99 | G0 | Proje CLAUDE.md yeniden yazılmayacak (kullanıcı kararı 2026-09-18: "kurallara gerek yok"). |
| U51 | 100 | G11 | Tipli hata göçü: kullanıcı kararı "önce riskli modüller" (auth, hesap, davet, workspace).  |
| U52 | 101 | G0 | React hook bağımlılık uyarıları: 20 adet (0 hata), 2026-09-18'de açıldı. Her biri bayat ka |
| U53 | 102 | G16 | Workspaces listesinde SON satırın "…" menüsü kırpılıyor: .workspace-list { overflow: hidde |
| U54 | 103 | G16 | Kurulumu bitmemiş business'ı "Discard" etmek 10 dakikadan eski oturumda API tarafından red |
| U55 | 104 | G11 | AcceptInvitationPage "yanlış hesap" durumu sunucunun İngilizce cümlesine bağlı; API artık  |
| U56 | 105 | G16 | Pending sayfası, kurulumu bitmemiş bir business'ı o business'ın SAHİBİ OLMAYAN üyesine hâl |
| U57 | 106 | G16 | finalizeActivation reddedilirse employee onboarding sayfası asılı kalabiliyor; yalnız askı |
| U58 | 107 | G16 | Workspaces sayfasının satır DIŞI metinleri hâlâ eski dilde ("Workspaces" başlığı, açıklama |
| U59 | 108 | G18 | HATA (uygulama içi DocumentReviewDrawer): dosya yükleme, taslak dosya silme ve erteleme li |
| U60 | 109 | G18 | DocumentReviewDrawer'ın 10 mutation'ından 8'i hiç test edilmiyor (acknowledge, withdraw, d |
| U61 | 110 | G0 | KARAR (kullanıcı, 2026-09-18): uygulama içi EmployeeDrawer da aynı mantığı alacak. |
| U62 | 111 | G0 | Üç cron endpoint'i tetiklenmiyor KAPANDI 2026-09-19: dördü de pg_cron'da (OPS-014, b70 |
| U63 | 112 | G4 | Zamanlanmış export işi hosted'da 503 "Email delivery is not configured" dönüyor: job ve ye |
| U64 | 113 | G24 | Hosted'da VITE_API_URL tanımlı değil; web aynı alan adına relative istek atıyor. Bugün doğ |
| U65 | 114 | G0 | 2026-09-19 kullanıcı kararı: katılım zinciri (davet, onboarding, çakışmalar, business kapa |
| U66 | 290 | G0 | Gözlem (madde değil): 2026-09-27 yerel e2e koşusunda Chrome bir kez 0xE0000008 ile çöktü,  |
