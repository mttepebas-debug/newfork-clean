# Devir raporu — "Sayfa sayfa kayıp ve güncellik denetimi"

Hazırlayan: bu thread'in Claude'u, 2026-10-14 (California saatiyle 09:45 civarı).
Thread kökü: `cmsg_013zBzr8GJv9vVEM4zDoaKrVLdQe82L7XsAeqVzC17s5K5`. Oturum sayfası: https://claude.ai/code/session_01Ugsi3nzmxVN79dmGB4mouo

## 1. Amaç
Mert'in 2026-10-09 planı. Kaynak: Mert'in sözü.
1. **Dalda bekleyen kodlar.** Kodu yazılmış ama main'e girmemiş işler önem sırasıyla, bir bir anlatılacak. Her biri için 5N1K, bugün nasıl göründüğü ve main'e alınırsa ne değişeceği, mümkünse ekran görüntüsüyle verilecek. Mert onay verirse iş trenle main'e alınacak. İstemezse iş silinecek ya da yedeklenecek.
2. **Tasarlanmış ama hiç kodlanmamış işler** (ikinci aşama). Bunlara henüz başlanmadı.

## 2. Bitenler

| Konu | Sonuç | Kanıt |
|---|---|---|
| **DB-4:** Schedule yayın kuralları | Main'de ve canlıda | main 7183b306 |
| Geçmiş önemli gün / duyuru durumu (fb-6.7) | Atlandı; yama dosyası duruyor | `/mnt/project-files/notes/dalda-bekleyenler/` |
| **BL-435:** yenilenme sinyali | Main'de | 53499576 |
| **BL-257:** Requests durum rengi | Main'de | 0a26eb30 |
| Tanıtım sitesi (4 sürüm) | Yalnız GitHub'da yedek (`backup/tanitim-sitesi/*`); main'e ve canlıya alınmaz | — |
| BL-990 için eklenen çift test | Geri alındı; koruma zaten eslint'te (`eslint.config.mjs:39-55`) | main 74131a7e |
| Eski ajan notları (73 not) | Kalıcı 10 ders klasör CLAUDE.md'lerine girdi (supabase +8, e2e +1, web +1); notların kendisi duruyor | main 48c7c443; `/mnt/project-files/notes/eski-ajan-notlari/` |
| "Main'e alınmayacaklar" listesi (madde 2–8) | Silindi; yerel yedekler Mert'in bilgisayarında | `silme-listesi.md`'deki bütün satırlar ✅ |
| Kurtarma dalları `claude/project-thread-jcgonw` ve `task/ekran-02-kurtarma` | İçerikleri main'de olduğu için silindi | aşağıda ayrıntı |
| Madde 9 ve madde 1 (#38): 4 dal | Mert 2026-10-13 17:19 California saatinde "Bunlar silinsin hepsinin yeni versiyonları yapıldı" dedi; dallar 17:20'de silindi, yedekleri Mert'in bilgisayarında | `task/ekran-01-38`, `ghost-color-mockups`, `task/schedule-dialog-mockups`, `task/var-ekran-12` |

Dalların içerik ölçümleri:
- `claude/project-thread-jcgonw` @1700a07b: dalın ağacı main'in atası 48c7c443 ile birebir aynı.
- `task/ekran-02-kurtarma` @20797df9: dalın 54 commit'inin hepsi main'de aynı patch-id ile duruyor.

## 3. Yarım kalan iş ve sonraki adım
- **Arşiv kopyaları:** Mert'in tek açık kararı bunlar. Beş dal duruyor:
  - `archive/avail-design`, `archive/ghost-color-mockups`, `archive/schedule-dialog-mockups`, `archive/var-ekran-12`
  - `task/avail-design` (`archive/avail-design` ile aynı sha)
  - Bu beşi proje hafızasındaki "silinmeyecekler" listesinde, o yüzden dokunulmadı.
  - Mert'e 2026-10-13'te "onlar da gereksizse yaz, sildiririm" dendi. Cevap yok.
  - Mert "sil" derse silmeyi Bilgisayarındaki Claude yapar: önce dalın ucunu yerelde yedekler, sonra normal delete ile siler.
- **Planın ikinci aşaması:** tasarlanmış ama kodlanmamış işler. Henüz başlanmadı. Liste `LISTE.md` → "İkinci aşamaya" bölümünde:
  - Important Dates History sekmesi
  - Kapalı gün kaydı bulgusu
  - `bl217` testi
- `claude/project-thread-jssdxn` şimdi @33e510f2. Ucu artık bu thread'in değil, Requests kod işinin. Bu thread o dala dokunmaz.

## 4. Mert'ten beklenen
1. Beş arşiv dalı için sil ya da kalsın kararı. Önerim: Mert yeni sürümlerin yapıldığını söylediği için silinsin. Görseller Artifact sayfalarında kalıyor.
2. İkinci aşamaya ne zaman geçileceği.

## 5. Dal ve push durumu
- Bu thread'in dalı `claude/project-thread-jcgonw`:
  - GitHub'dan silindi. İçerik main'de olduğu için güvenli.
  - Yerelde ucu 1700a07b'de. Bu commit'teki iş main'de; push'lanmamış yeni iş yok.
- Bulut kabındaki geçici çalışma klasörlerinde saklanacak bir şey yok:
  - `wt-ghost`, `wt-dlg`, `wt38`: silinen dalların tasarım deneme kopyaları.
  - `wt-main` (`bl257-prep`): içeriği main'de.
  - Yalnız hayalet kart varyant CSS'i kaynak klasörüne kopyalandı.
- **GÜVENLİ DEĞİL bölümü:** yok. Push'lanacak iş olmadığı için nf-guvenlik incelemesi de gerekmedi.

## 6. İlgili dosyalar
- `/mnt/project-files/notes/dalda-bekleyenler/LISTE.md`: ana liste ve madde ayrıntıları (5N1K).
- `/mnt/project-files/notes/dalda-bekleyenler/silme-listesi.md`: silinen her dalın sha'sı, silinme nedeni ve tarihi, yedeğin yeri.
- `/mnt/project-files/notes/dalda-bekleyenler/landing/`: tanıtım sitesi görselleri.
- `/mnt/project-files/notes/eski-ajan-notlari/`: 73 not, README ve `.kaynaklar.txt`.
- `/mnt/project-files/devir/threadler/sayfa-denetimi-kaynak/`:
  - `shot1-4.mjs`: Playwright ekran görüntüsü betikleri. Harness portu 5701, Chromium `/opt/pw-browsers/chromium`.
  - `ghostColorVariants.css`: eski hayalet kart varyantlarının CSS'i.

## 7. Artifact'ler
Her biri tek dosya, görseller içine gömülü. Bu sayfaları yeniden yayınlamadan önce `bant.py` koşmalı.

| Sayfa | Link | Kaynak |
|---|---|---|
| Hayalet kart denemeleri (eski) | https://claude.ai/artifact/LzLBAoEfPikvF3bxop8US7 | `/mnt/project-files/pages/hayalet-kart-denemeleri.html` (yerel kopyada kaynak bandı yok) |
| Sağ üst pencere stilleri | https://claude.ai/artifact/CB4PkvR1hJwmV4n4uMJMRz | `/mnt/project-files/pages/sag-ust-pencere-stilleri.html` |
| Müsaitlik tasarımları (başka thread'in) | https://claude.ai/artifact/Ci3eocAuUVopdj3nGEGebs | — |
| Artifact klasör dizini | https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471 | `/mnt/project-files/pages/kaynak-bandi/` (`dizin.py`) |

Artifact'ler eski hesapta kalır; yeni hesap bunları göremeyebilir (iki hesap birbirinin sayfasını görmez). Kaynak HTML'ler `/mnt/project-files/pages/` altında olduğu için yeni hesap bunları yeniden yayınlayabilir.

## 8. Yeni hesaba taşınacak kurallar ve çıkarımlar
- **Dil:** Mert'e Türkçe ve sade yazılır; 5N1K, önce/sonra ve mümkünse görselle. Saatler California saatiyle verilir (Ekim'de UTC−7).
- **Seçenekli sorular:** her çoktan seçmeli soru ayrıntılı açıklanır ve son seçenek "Yazarak cevap vereceğim" olur. Varyant sayfalarında "hangisi?" kartı yoktur: link verilir, Mert'in yazması beklenir.
- **Dal silme:** 2026-10-11'den beri Claude'un işi. Yerel yedekle, Bilgisayarındaki Claude yapar. Force push, mirror ve prune hâlâ yasak. "Silinmeyecekler" listesindeki dallar (bütün `archive/*` dahil) Mert açıkça söylemeden silinmez.
- **Dalın main'de olup olmadığını ölçmek:**
  - `git cherry` tek başına yanıltır, çünkü yeniden kurulmuş commit'ler orada "yok" görünür.
  - Doğru ölçüm: dalın ağacı main'deki bir commit'le aynı mı (`git diff <main-commit> <dal>` boş), ya da commit başına `git patch-id --stable` aynı mı.
- **Benim hatam:** 2026-10-10'da main'de olmadığını sandığım bir test korumasını ikinci kez yazdım; aynı kontrol zaten eslint'te vardı. Ders: yeni test ya da korumadan önce lint ve config dosyaları da aranır.
- **Schedule harness'i:** Vite config'te `dedupe: ["react","react-dom"]` yoksa sayfa "Invalid hook call" verip boş açılır. Yeni çalışma klasöründe `packages/ui` ve `packages/shared` node_modules bağlantısı gerekir; yoksa `sonner` bulunamaz.
- **Hayalet kart:** 2026-10-11'de Mert hayalet kartın asıl vardiya renginde, soluk ve çökük, yazısı aynı okunaklılıkta olmasını istedi. Bu iş "İzinli günde diğer lokasyonda Add shift" thread'inde D varyantı olarak yapıldı (https://claude.ai/artifact/PeCwcUC922XVirLhgBYfBr). Seçilirse `KARARLAR.md:432`'deki 2026-09-26 "tek ölü gri" kararı değişir. Kayıt koordinatör üzerinden yapılır.
- Açık sorular `docs/plan/SORULAR.md` dosyasında. Soru-20: Schedule üst çubuğu dar pencerede. Soru-21: tek lokasyonlu haftada Pazar sığmıyor. Varyant dalları silindi; Mert yeni sürümlerin yapıldığını söyledi.

## 9. Yeni hesap için brief taslağı
```
İŞ: DENETIM-2 — "Dalda bekleyenler" planının kalanını bitir.
Bağlam: /mnt/project-files/devir/threadler/sayfa-denetimi.md (bu rapor), /mnt/project-files/notes/dalda-bekleyenler/LISTE.md, silme-listesi.md.
Bitti ölçütü:
 1. Mert beş arşiv dalı (archive/avail-design, archive/ghost-color-mockups, archive/schedule-dialog-mockups, archive/var-ekran-12, task/avail-design) için sil/kalsın dedi; "sil" ise Bilgisayarındaki Claude yerel yedekle sildi, silme-listesi.md güncel.
 2. İkinci aşama (tasarlanmış ama kodlanmamış): LISTE.md "İkinci aşamaya" maddeleri ve tasarım sayfaları tek tek, 5N1K + önce/sonra + görselle Mert'e anlatıldı; her biri için kodla / bekle / sil kararı alındı.
Dokun: /mnt/project-files/notes/dalda-bekleyenler/ · Dokunma: main, KARARLAR/DURUM/BACKLOG/SORULAR (kayıtları koordinatör yazar), "silinmeyecekler" listesi.
Sınıf: normal (salt okuma ve anlatım; kod işi çıkarsa ayrı thread).
Kurallar: Türkçe, California saati, "Yazarak cevap vereceğim" seçeneği, varyant seçim kartı yok, Mert'e git komutu yok.
```
