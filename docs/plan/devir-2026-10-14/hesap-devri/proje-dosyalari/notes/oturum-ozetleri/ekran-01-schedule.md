# EKRAN-01 Schedule — oturum özeti

Okunan oturumlar: `session_011jpJuwTY2Y8p5ws6bY1ArM` (2026-10-07 07:56 → 10-08 07:31, tam), `session_018Dg5Qat4Kj5wrbQMD5MdXE` (10-08 08:44 → 09:50), `session_01XHtcDmihQB5Cm5GM6TwLFv` (10-08 10:22 → 22:32). Üçü de aynı yerel Claude Code oturumunun (`…suspicious-mirzakhani-3d79e2\4d7d379f…`) bulut aynası; 2026-10-07 öncesi kısmı görünmüyor.

## Özet (≤5 satır)
1. Bu üç oturumda Mert'in doğrudan yazdığı tasarım girdisi yok: tek insan mesajı 10-07 17:51 "/code-review max". İşler koordinatörden aktarıldı.
2. Mert'in aktarılan tek Schedule bildirimi BL-974 ("by role" + Jobs süzgeci) — main'de `ab4e68b6`.
3. Bu oturumlarda claude.ai tasarım sayfası yok; kanıt olarak önce/sonra PNG'leri (`artifacts/EKRAN-01/`) var. Devir notu da "Bu işler için claude.ai Artifact sayfası ya da varyant sayfası yok" diyor.
4. Schedule tasarım seçimleri eski yerel oturumlarda (2026-09-26 … 10-06) ve 2026-10-09 Artifact turunda (Project thread'leri) verildi. Hepsi KARARLAR'da; 2026-10-09 olanlar kodda değil.
5. Kayıp tasarım bulunmadı. Ama dalda kalan iki varyant/taslak seti ve kayıtta olup kodda olmayan yedi 2026-10-09 seçimi var (aşağıda).

## İstekler ve durum
| # | Ne (Mert'in sözü / seçimi) | Ne zaman, nerede | Durum |
|---|---|---|---|
| 1 | "schedule gridde by role olarak sort out edip filtrelerden job seçince seçimde olmayan joblar da gözüküyor gridde" (BL-974, S-101) | 2026-10-08 ~12:40Z, koordinatör penceresi, 01XHtc'ye 12:34'te aktarıldı | Kodda+main `ab4e68b6` (dal `task/bl-974`@3607ae0b rebase öncesi) |
| 2 | Onaylı izinle 1 dakika bile çakışan vardiya yazılamaz; hücre kırmızı, "Time off" (BL-995; #38 iptal) | 2026-10-09 05:57Z, S5 thread'i | Yalnız kayıtta (KARARLAR §1.1); BL-995 açık. Eski #38 dalı `task/ekran-01-38`@2f107766 artık geçersiz |
| 3 | Ad yanındaki "!": A — yalnız müsait olunmayan hücreler açık turuncu | 2026-10-09 08:13Z madde 1 (Artifact turu) | Yalnız kayıtta (KARARLAR) |
| 4 | İzin hücresi bugünkü gibi kalır (düz kırmızı "TIME OFF") | 2026-10-09 08:13Z madde 6 | Kodda+main (değişiklik yok) |
| 5 | Tam gün izin hücresine tıklayınca pencere açılsın mı | 2026-10-09 08:13Z madde 6 | AÇIK — karar yok |
| 6 | "!" penceresi kaydırınca kapanır (B) | 2026-10-09 08:13Z madde 15 | Yalnız kayıtta |
| 7 | İzin hücresinde hover/sürükleme A "sakin" | 2026-10-09 08:13Z madde 16 | Yalnız kayıtta |
| 8 | Rozette yayın işareti: varyant 6 (yayında işaret yok, yayında değilse "NEW") | 2026-10-09 08:21Z madde 3 | Yalnız kayıtta |
| 9 | Sürüklerken o lokasyonda alamayanlar gizlenir (B) | 2026-10-09 08:21Z madde 4 | Yalnız kayıtta (2026-10-06 üç renk kuralının bir kısmının yerine geçer) |
| 10 | Şablon penceresi: A/B/C reddedildi, bugünkü kalır | 2026-10-09 08:05Z | Kodda+main (değişiklik yok); yeni yön bekliyor |
| 11 | Templates çalışan adlarını korur; departmanlar katlanır (#28 #29, BL-038 K3 K4) | eski karar; kod 10-08 | Kodda+main `ca0553bd`, `b82fc5a4`; Mert'in kapanış bakışı bekliyor. Ek test `task/ekran-01-templates`@94fdfc57 yalnız dalda |
| 12 | Undo (#12, BL-762, BL-998) | eski kabul maddesi | Kodda+main (`029c1c57` … `dfd57b89`) ve canlıda |
| 13 | Vardiya penceresinde saat 12/24 kişisel seçime uyar (BL-055) | 2026-10-09 | Kodda+main `3e2be180` |
| 14 | Dar pencerede üst çubuk (#86, BL-445): A/B/C varyantları | 2026-10-06 varyant turu | Yalnız dalda `task/var-ekran-12`@d7c4130b (yedek `backup/uncommitted/task/var-ekran-12`@8534f451); seçim yok |
| 15 | Tek lokasyonda Pazar (#87, BL-717): B/C varyantları | 2026-10-06 varyant turu | Yalnız dalda `task/var-ekran-12`@d7c4130b; seçim yok |
| 16 | İki Templates yüzeyi (#88, BL-722) | — | Karar yok, varyant yok |
| 17 | Diğer lokasyon hayalet kartı varyantları 11–15 | 2026-09-26 | Seçilen main'de; taslaklar yalnız dalda `ghost-color-mockups`@c79991d1 |
| 18 | Sağ üst pencereler stil B taslakları | 2026-09-28 | Seçilen main'de; taslak yalnız dalda `task/schedule-dialog-mockups`@0b2f998c |
| 19 | S24 (BL-759), S25 (BL-238) | 2026-10-08 devir | Mert'e soru bekliyor (DURUM B16) |
| 20 | Search kutusu çerçevesi #7f8c86 (Requests, Notifications ve Schedule üst çubuğu; S2 C3 dalı) | 01KFP7, 2026-10-08 07:02 soru kapatıldı (cevap yok) | Karar yok; bkz. `koordinator.md` |

Dalda kalan, main'de olmayan diğer Schedule işleri (tasarım değil): `task/ekran-01-docs3`@7c646673 (açık iş notu), `task/ekran-01-db4`@f5282ef2, `task/ekran-01-docs2`@287a4e6b. Hepsi `backup/yedek-dallar-listesi` → `docs/yedek-dallar-20261009.md` listesinde.

## Linkler
- Schedule ile ilgili Artifact'lar (eski, Hesap 1): müsaitlik/izin hücre prototipi https://claude.ai/artifact/YVEK49zkyYR1wJiSTU5EMa (2026-10-01, G14 dilim c); Schedule prototipi + liste dili https://claude.ai/artifact/SmqEkabujEfXHCktUxqbbK (2026-10-04/05; özel, Mert'in e-postaları içinde); liste sayfaları beş sistem https://claude.ai/artifact/R22hrq2pwAET22CKT6K1BE (2026-10-06, Sistem 1).
- 2026-10-09 Schedule tasarım Artifact sayfalarının linkleri bu oturumlarda yok (Project thread'lerinde; başka işçi okuyor).
- Repo: `docs/plan/devir-2026-10-08/EKRAN-01.md`, `docs/plan/ekranlar/01-schedule/EKRAN.md`, `docs/plan/ekranlar/01-schedule/uygulama/VAR.md`, `docs/plan/research/PROTOTIP-SCHEDULE-2026-10-05.md`.
- Eski kararlar ayrıntısı: `/mnt/project-files/notes/oturum-ozetleri/schedule-eski-kararlar.md`.

## Açık sorular
1. #86, #87: 2026-10-06 varyantları (`task/var-ekran-12`) Mert'e yeniden gösterilsin mi, yoksa yeni Artifact varyantı mı hazırlansın?
2. #88: Templates penceresi mi, `/app/schedule/templates` sayfası mı kalır? (2026-10-09'da yalnız pencerenin yeni biçimleri reddedildi.)
3. Tam gün izin hücresine tıklama (madde 6, AÇIK).
4. 2026-10-09 seçimlerinin (madde 1, 3, 4, 15, 16) uygulama işi henüz açılmadı — hangi sırayla?
5. #28 #29 Templates için Mert'in kapanış bakışı.
