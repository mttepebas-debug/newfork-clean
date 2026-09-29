# Done

Format: `YYYY-MM-DD | ID | sonuç | commit`. Yalnızca sona ekle. Buradaki kanıtlar yereldir; hosted/release kanıtı sayılmaz.

2026-09-11 | BL-026 | web typecheck temeli | -
2026-09-11 | BL-035 | rehire invite Auth ban kaldırma | -
2026-09-11 | BL-063 | toast standardı | -
2026-09-14 | BL-051 | Roles & Permissions core | fc2c4da
2026-09-14 | BL-055 | Account core (Profile/Preferences/Notifications/Workspaces) | fc2c4da
2026-09-14 | UI-TRIAL-001 | Schedule sticky lokasyon başlıkları | 5068532
2026-09-15 | BUG-001 | notification katalog duplicate key | 2666283
2026-09-15 | BL-066 | dark tema rollout | d18a1bb
2026-09-15 | BL-064/068 | Schedule drag/drop conflict + Conflict handling sayfası | 7a35dbc
2026-09-15 | BL-069 | same-holder edit-session lease yenileme | 2e4f08b
2026-09-15 | BL-036 | Schedule metadata paralel okuma | 6357397
2026-09-15 | BL-039/049/050 | preview/publish state, Schedule Rules, Shift Catalog | a72f589
2026-09-16 | BL-037 | Export v2 yerel kabul (kod rescue branch'te) | 14647f8 (rescue)
2026-09-16 | BL-052/001 | document lifecycle yerel kabul (kod rescue branch'te) | 14647f8 (rescue)
2026-09-16 | SETUP | Codex belgeleri arşivlendi; Claude plan sistemi ve rescue branch kuruldu | (bu commit)
2026-09-16 | RESCUE-001 | rescue WIP main'de; typecheck/build PASS, topbar fix | d19542d
2026-09-16 | TEST-001 | unit testler yeşil, vitest env izolasyonu, availability katalog paritesi | 95063a7
2026-09-16 | EXP-000/EXP-001 | Export paneli D (Settings dili, inline önizleme), Excel başlıkları, unified print, side-by-side bant | 4bbe806
2026-09-16 | OPS-012 | post-MVP yüzeyleri bayrakla gizlendi, README/env temizliği | 8642575
2026-09-16 | OPS-011 | GitHub Actions CI (typecheck+test, concurrency=1) yeşil | 6509e38
2026-09-16 | THEME-001 | dark tema emekli, light sabit; görsel kontrol OK | c0ecf3d
2026-09-16 | THEME-002 | light token seti, z-index, AA kontrast | 6f677a0
2026-09-16 | LOC-001 | Locations tablo/drawer: adres+telefon, short name önerisi, inline delete | 4f0413c
2026-09-16 | THEME-004 | sayfa CSS token'ları, on-accent/muted-strong, employee+manager AA 0 | bd6877a
2026-09-16 | LOC-002 | short name backfill+strict, onboarding öneri/telefon, hosted migration | 198f305
2026-09-17 | AUTH-001 | kayıt sonrası döngü kırıldı, switcher panel görünümü, sign-in prod metni, incomplete onboarding'de context 503 düzeltmesi | a69276e
2026-09-17 | AUTH-002 | davetli hesap workspace yaratamaz (DB guard + 403), onboarding case'i workspace'e göre seçilir (getter + mutasyonlar + availability), API ?workspaceId= | 58eeb99
2026-09-17 | AUTH-UX-001 | auth/davet/onboarding UI: owner onboarding çıkışı, switcher davet satırı + recovery, Not now + login kapısı, no-org bekleme, sonlanan oturum → sign-in, /welcome/:workspaceId; lineup contract testi (CI) | 59446ff
2026-09-17 | AUTH-004 | owner kurulumu yarım workspace'te owner olmayan üye owner sihirbazı yerine "Workspace setup in progress" paneli görür | dfe6fb4
2026-09-18 | UI-DOC-002 | Documents ayar listesi: requirement filtresi, ayrı kolonlar, published için salt okunur drawer | abd79ed
2026-09-18 | OPS-015 | AUTH-002 migration'ları hosted'a uygulandı; imzalar ve publication filtresi hosted+local doğrulandı | - (kod değişikliği yok)
2026-09-18 | DEBT-001 P0 | fast-uri zafiyet zinciri kapandı, lint yeşil + CI'a lint/build, docs push'ları CI'ı iptal etmiyor, ölü paket silindi (−1.930 satır) | c56bf8e
2026-09-19 | OPS-014 | Dört cron işi Postgres'ten tetikleniyor (outbox dakikalık, exports 5 dk, hesap silme ve saklama günlük); sırlar Vault'ta | b7052f6
2026-09-19 | HOSTED-FIX | `/shifts` Vercel'de API'ye yönlendirilmiyordu; vardiya ekleme/güncelleme/silme/toplu işlemler hosted'da kırıktı, düzeltildi | 49a789b
2026-09-22 | AVAIL-001 | Settings → Scheduling'de Entry mode değişince her kayıtlı hafta (çalışanınki + Manager reminders) aynı kaydetmede yeni moda çevriliyor; çevrilemeyen hafta mod değişimini durduruyor; bildirim yalnız haftası çevrilenlere, dönüşümden sonra | 944bad7
2026-09-22 | BTN-001 | Vazgeçme butonları (Cancel, Discard, Back…) artık yeşil değil beyaz; Workspaces'te "Current" rozeti kalktı; profil fotoğrafı Remove ve şablon penceresi Delete iki tık oldu; eski elle yazılmış iki tık kopyaları (Locations, Announcements, Schedule Templates, taslak/kaydet menüleri) ortak parçaya taşındı, silahlı yazı her yerde "Confirm …" | (bu commit)
2026-09-23 | DIALOG-001 | Uygulamada tarayıcının onay/yazı kutusu kalmadı: Schedule'da başkasının taslağının üstüne yazma, belge çekmecesini kaydetmeden kapatma ve Employees'ta "Request changes" notu artık uygulamanın kendi penceresinde (seçilen tasarım B) | (bu commit)
2026-09-24 | BL-102 | Veritabanı saat dilimi adını her kontrolde diskten okumak yerine hazır listeden buluyor: CI'da veritabanı testleri 229 → 40 sn, db işi 6 dk 53 sn → 3 dk 10 sn; müsaitlik kontrolü çağrı başı ~102 → ~1,4 ms. Schedule, yayın önizleme, otomatik doldurma ve takas ekranlarında vardiya başı gecikme de düşmüş olmalı (ekranda ölçülmedi). 692d7fa.
2026-09-24 | BL-107 | CI GitHub'ın ücretli makinelerinden kullanıcının bilgisayarına taşındı (self-hosted runner newfork-local-pc, WSL): her gönderimdeki testler artık $0; check işi ~7,5 dk → ~3,6 dk, toplam 8–9 dk (işler sırayla). CI'ın veritabanı ortak yerel veritabanından ayrı. GitHub Actions harcama limiti $0. ad0a435.
2026-09-24 | BL-112 | CI'ın üç işi (kod kontrolü, veritabanı testleri, tarayıcı testleri) kullanıcının bilgisayarında üç ayrı çalıştırıcıda aynı anda koşuyor: her gönderimden sonraki bekleme 8–9 dk → ~4 dk, hâlâ $0. Her çalıştırıcının kendi test veritabanı var; ortak veritabanına dokunulmuyor. e1e9512.
2026-09-25 | TEAM-001 | Agent Teams AI bırakıldı; koordinatör + 7 sabit rol ajanı (`.claude/agents/nf-*`) ve işçi oturumu düzeni kuruldu, deneme turu geçti | 27e2062
2026-09-25 | FB-6.0-can | web yetki sözleşmesi doğdu: can(), isNoAccess(), ortak eylem kataloğu; SQL matrisiyle 1890 hücre uyuşuyor, ekran değişmedi | f7c6772
2026-09-25 | BL-128 | API'nin genel hata yakalayıcısı yetki reddini gerekçesiyle gönderiyor; web isNoAccess() onu tanıyor | 8802229
2026-09-25 | BL-131 | API 4xx cevaplarında veritabanının ham ayrıntısı (tablo/kısıt adı, satır değeri) artık gitmiyor; tanınmayan hata 500 | 787ff8f
2026-09-26 | FB-6.1 .2+.3 | Takvim'in 34 DB giriş noktası ve 80 API geçişi yetki çekirdeğine soruyor; plan kilidi devralma silindi; müsaitlik bildirimi kişiyi yöneten herkese | f210196
2026-09-26 | BL-136 + BL-138 | Giriş ve çalışan onboarding alanlarının odak halkası ve kenarı WCAG AA'yı geçiyor; alt linkler telefonda tutturulabiliyor | 6061d34
2026-09-26 | BL-080 | yeni owner kurulumda resmî adını veriyor, Account > Profile'da görüp değiştirebiliyor; resmî adsız kişiye sahiplik devri yok | 917f68b
2026-09-21 | BL-077 | web testleri paralel yükte zaman aşımına düşmüyor (`testTimeout: 20000`) | d03532c
2026-09-23 | BL-097 | başka lokasyonun taslak vardiyası plan oturumu kaydedilince artık silinmiyor; kilit taslak başına, oturum lokasyonu dışındaki yazım 42501 | e860d66
2026-09-26 | BL-142 | kurulum sihirbazının alanları WCAG AA; telefonda Tab ile gelinen alan Continue çubuğunun arkasında kalmıyor | a4638b4
2026-09-26 | FB-6.1.10 (BL-115) | belge eksiği olan çalışanın canlı bildirimleri sayfa açılışında ~5 sn gecikmiyor; izinsiz Shift Hub kanalı hiç açılmıyor | a458d32
2026-09-26 | BL-139 | müsaitlik bildirimini alan müdür o kişinin müsaitliğini açabiliyor; Manager note yalnız çalışan hakkında, terfide siliniyor | f0ca450
2026-09-26 | FB-6.1.5 | yalnız bazı lokasyonları yöneten müdür, kişilerin diğer lokasyonlardaki yayınlanmış vardiyalarını ghost kart olarak görüyor (iş, tip, etiket; not yok); ızgara ≤22 ms | 9dc5b39
2026-09-26 | BL-140, BL-143, BL-146, BL-150 | CI yük altında yanlış kırmızı vermiyor (bütçe testi ve temizlik adımı), e2e dosyaları tip kapısında, bozuk izin testi yeşil listede | 4dedc62
2026-09-26 | FB-6.1.4 | Takvim'in her işi tek veritabanı fonksiyonu (yayın 9→1); çok lokasyonlu taslak/şablon/yayın/dışa aktarmada bütün lokasyonların yetkisi soruluyor; ızgara 16 ms | b126918
2026-09-26 | BL-148 (kısmi) | Account ekranlarında 30 ham renk tema token'ına geçti, görünüm aynı | b90a1cd
2026-09-26 | BL-137 (işlevsel) | parolasını unutan kişi giriş ekranından sıfırlama bağlantısı isteyip yeni parola belirleyebiliyor; hesabın varlığı dışarıdan anlaşılmıyor | ec7fd07
2026-09-26 | BL-165 | Account → Workspaces'te "⋯" menüsü artık kesilmiyor, klavyeyle gezilebiliyor | 45a17db
2026-09-26 | BL-158 | "On call" gibi vardiya etiketleri yayında, yeniden düzenlemede, kurtarılan taslakta ve takastan sonra kaybolmuyor; ghost kartta görünüyor | 52c307e
2026-09-26 | FB-6.1.6 | onaylı izin müdürün vardiya yazmasında her zaman kesin engel; ayar ekranından seçeneği kalktı | 73eee2d
2026-09-26 | BL-170, BL-171 | yerel veritabanı testleri güncel test yardımcılarıyla koşuyor; belge testi ortak ortamda yanlış kırmızı vermiyor | efb285d
2026-09-26 | FB-6.1.7 | müsaitlik ayarı Sert'e çekilince, önceden kabul edilip yayınlanmış değişmemiş vardiyalar haftanın yeniden yayınını engellemiyor | (main)
2026-09-26 | FB-6.1.9 (kısmi) | Takvim ekranlarının düğmeleri yetki çekirdeğine soruyor; lokasyonu olmayan müdür sunucunun reddedeceği düğmeleri görmüyor | ffca7eb
2026-09-26 | BL-177 | izin talepleri bir üst kademeye gidiyor: müdür başka müdürün, admin owner'ın iznine karar veremiyor; owner'ın talebi anında onaylı | (main)
2026-09-26 | FB-6.1.12 | yayın ve çok lokasyonlu yayın akışları tarayıcıda uçtan uca sınanıyor (e2e 10 senaryo) | dd937fd
2026-09-24 | BL-092 | takasta bırakılan vardiya kendisiyle çakışmıyor; aynı saatteki iki lokasyonlu takas tamamlanıyor | migration 20260924161659
2026-09-24 | BL-093 | eski Requests takas akışı silindi; vardiya yalnız Shift Hub'da el değiştiriyor, lokasyonu olmayan aday listeye girmiyor | migration 20260924163120
2026-09-24 | BL-095 | Line Up ve aday listesi silindi (FOUNDATION-B 5.6) | migration 20260924180901
2026-09-23 | BL-098 | çalışan kartını kaydetmek onaylı tercih edilen adı artık silmiyor | migration 20260923101814
2026-09-24 | BL-103, BL-104, BL-106 | CI kullanıcının bilgisayarına taşınınca (BL-107) ücretli dakika, imaj indirme ve çift koşu sorunları ortadan kalktı | ad0a435
2026-09-24 | BL-111 | yerel Supabase'in log servisi Docker Desktop'ta düşmüyor (analytics kapalı) | a530d02
2026-09-24 | BL-113 | eski projenin üç runner servisi kapatıldı | -
2026-09-26 | BL-141 | onboarding'deki "Share my info" kutusu Continue çubuğunun altında kalmıyor (bayat bulgu, iş gerekmedi) | -
2026-09-26 | BL-160 | Takvim'in ret testleri gerçek authz gerekçesini ve ayrıntısını da denetliyor | 79c8d13
2026-09-26 | BL-074 | kapsam-yonetimi.md artık var olan docs/plan dosyalarını gösteriyor | 39028dc
2026-09-26 | BL-186 | müsaitlik bir tercih: hiçbir yolda vardiya yazmayı, kaydetmeyi, yayını ya da takası durdurmuyor, yalnız uyarı gösteriyor (yerel; hosted FB-6.1.14 ile) | 04e853a
2026-09-26 | BL-208 | iki lokasyonlu onaylı takas boş kapsam ayarı yüzünden artık 500 ile düşmüyor | 22d73de
2026-09-26 | FB-6.1.5 (ghost 11b) | başka lokasyondaki vardiyanın ghost kartı gerçek kartla aynı düzende, gri taramalı; lokasyon adı iğne baloncuğunda, klavye ve dokunmayla açılıyor | 52a00d6
2026-09-26 | BL-180 | takas e2e testi CI yükünde yanlış kırmızı vermiyor (asıl kök BL-208 düzeldi, bekleme 30 sn) | 021c63e
2026-09-27 | BL-148 + BL-166 | Account ekranlarında ham renk kalmadı, görünüm aynı; giriş alanlarının kenarı WCAG AA | f5fb2f1
2026-09-27 | FB-6.1.9 (API ekranları) | API'den okuyan 13 ekran yetki reddinde "erişim yok" kartı gösteriyor; istek yardımcıları reddin gerekçesini koruyor | 0693b51
2026-09-28 | SEC-001 | Supabase `net` şemasını kapatmıyor (yönetilen şema); risk kabul edildi, `net_access_stays_out_of_reach` bekçisi API'ye açılan her `net` yolunu yakalıyor | def86c18
2026-09-28 | BL-198 | onaylı bir takas artık eski bir taslağın yayınıyla geri alınamıyor; yayın reddediliyor ve önizleme nedenini söylüyor | 65bdeaae
2026-09-28 | BL-212 | ızgara kartının köşe işaretinin iki eksik durumu testli | 65bdeaae
2026-09-28 | BL-205 | telefonda birleşik haftada kart başlıkları harf harf kırılmıyor; gün sütunu okunur genişlikte, gerekirse hafta yatay kayıyor | 65bdeaae
2026-09-28 | BL-197 | şablon uygulanınca arşivli etiket vardiyaya geçmiyor; mesaj bırakılan etiketleri adıyla söylüyor | 65bdeaae
2026-09-28 | BL-234 | yayından kaldırılan hafta aynı taslakla yeniden yayınlanabiliyor (önizleme artık 500 vermiyor) | efef60c1
2026-09-28 | BL-218 .1–.2 | Management departmanı ve Owner işi korunan sistem kayıtları; owner yalnız Owner işine atanıyor; exclude edilen kişi yeni taslaklarda gizli | 2cdffd2c
2026-09-28 | BL-237 | beş Schedule pgTAP dosyası tarihten bağımsız kendi dünyasında; yerel test:db yanlış kırmızısı 23 → 18 dosya | 8f80282c
2026-09-28 | BL-192 | telefonda yönetici alt menü çubuğuyla gezinebiliyor | 74bb480e
2026-09-28 | BL-231 | çalışan çekmecesinin seçim listeleri API ve yetki çekirdeğinden geliyor | 59b41c7f
2026-09-28 | BL-230 | hafta yayından kaldırılıp yeniden yayınlansa da onaylı takas korunuyor | 51bf2b8e
2026-09-28 | BL-221 | belgesi eksik owner'ın kendi izni de onay beklemeden kaydoluyor | 8dfdfcbe
2026-09-27 | BL-222 | tarayıcı Settings kataloğunun altı tablosunu artık doğrudan okuyamıyor; okuma yalnız API'den (kayıt 2026-09-28) | 89fdf494
2026-09-28 | BL-078 | işlem gerekmez (kullanıcı kararı): yanlış commit'e giren migration içerik olarak doğru, geçmiş değiştirilmedi | -
2026-09-28 | BL-239 | telefon ile masaüstü arasında tek geçiş genişliği (720px): altında yalnız alt çubuk, üstünde yalnız sidebar, yatay kaydırma yok | 2ca3803e
2026-09-28 | BL-240 | Employee Hub alt çubuğunun renkleri tema token'larından; seçili yazı 6,30:1, odak 5,25:1 | 2ca3803e
2026-09-28 | BL-214 | beyaz düğmeler ve Settings'in beş form alanı aynı koyu kenarda (`--theme-muted`, 5,07:1; önce 1,72 / 1,59); ekran bazlı ezmeler silindi | 7127bd96
2026-09-28 | BL-216 | birbirine çok yakın altı renk token'ı silindi, kullanımı 0; kalan çiftlerin ayrı rolü BACKLOG'da gerekçesiyle | dc3c9730
2026-09-28 | BL-235 | uyarı bildirimlerindeki "!" işareti okunur: rozet `--theme-warning`, 5,93:1 (önce 2,60) | dc3c9730
2026-09-28 | BL-250 | iki telefon alt çubuğunda klavye odak halkası aynı (3px, 2px dışarıda) | dc3c9730
2026-09-28 | BL-251 | iki telefon alt çubuğunun üst çizgisi aynı token (`--theme-border`) | dc3c9730
2026-09-28 | BL-100 | yerel ortak DB'de eski araştırmadan kalan "FX" workspace'i ve 4 deneme kullanıcısı silindi (kullanıcı komutu; yedeksiz, kullanıcı kararı) | -
2026-09-28 | BL-252 | sahiplik devri yalnız çalışan kaydı olan admin'e gider; Owner işi yeni owner'a geçer; eski owner'ın owner olduğu için muaf belgeleri yeniden istenir | cb6013fb
2026-09-28 | BL-246 | devirle owner olan kişinin açık belge ve acknowledgement'ları devir anında muaf, kimse geri alamaz | cb6013fb
2026-09-28 | BL-263 | owner'ın belge muafiyetini kaldırma isteği, eski sayfadan gelse de ilk seferde "owner'dan istenmez" diye reddedilir | cb6013fb
2026-09-28 | BL-266 | davet, silinmekte olan bir hesabın kilidini artık açmıyor | 721ea41f
2026-09-28 | BL-267 | Account → Security'de parola değiştirmek mevcut parolayı istiyor (sunucuda) | 721ea41f
2026-09-28 | BL-268 | Account → Workspaces'te kapatma ve sahiplik devri parolayı sunucuda soruyor; açık oturum yetmiyor | 721ea41f
2026-09-28 | BL-269 | parola sormayan eski hesap silme yolu kaldırıldı | 721ea41f
2026-09-28 | BL-274 | e-postasını onaylamamış hesap bir daveti göremiyor ve kabul edemiyor; kayıttan sonra "Check your email" ekranı | 721ea41f
2026-09-28 | BL-265 | hosted veritabanı main ile aynı: sahiplik devri kuralları ve onaylı e-posta şartı canlı ortamın veritabanında; güvenlik uyarısı yok | -
2026-09-28 | BL-199 | müdür Schedule'da vardiyaya not yazıp düzeltiyor ve siliyor; notlu kartta sol üstte mavi köşe, fareyle okunuyor; not yalnız vardiyanın sahibine (açık vardiyada lokasyondaki çalışanlara) ve yöneticilere gidiyor, iş arkadaşına gitmiyor | de80eda6
