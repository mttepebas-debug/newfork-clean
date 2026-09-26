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
