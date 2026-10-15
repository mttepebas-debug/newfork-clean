# Yerel klasör temizliği: envanter ve öneriler (2026-10-14, Kaliforniya 10:40)

Yazan: tren thread'i (Mert'in bilgisayarı).

**Bugün hiçbir şey silinmedi.**
- İlk silme denemesi bilgisayardaki izin denetiminde durdu: temiz ve GitHub'da kopyası doğrulanmış eski çalışma klasörleri.
- Bu yüzden her şey senin öğe öğe onayına kaldı. Onay verdiğin öğeleri ben silerim.
- İzin denetimi yine durdurursa, sana Terminal'de tek tıkla çalışacak komutlar veririm.

Ölçüler yaklaşık (MB = megabayt, GB = gigabayt).

---

## Bölüm 1. GitHub'da kopyası doğrulanmış, silinince hiçbir şey kaybolmayanlar

### 1. Eski çalışma klasörleri (35 adet, ≈10.5 GB)
- **Ne:** her iş için açılan ayrı kod kopyaları (worktree). İçlerinde o işin kodu ve yaklaşık 500 MB'lık indirilmiş paketler var.
- **Durum:** hepsi temiz, kaydedilmemiş değişiklik yok. Her birinin son hâli GitHub'da duruyor (ya main'in içinde ya da aynı adlı uzak dalda). En yenisi 12 Ekim.
- **Silinirse:** hiçbir şey kaybolmaz. İş gerekirse GitHub'dan yeniden açılır.
- **Liste:** c2r-wt (Temp), agent-a4489d63, agent-a7fbba72, agent-af032f88, hopeful-darwin, infallible-banach, serene-kowalevski, zealous-napier, acil-40001, bl-974, bl-804, bl-965, bl-987, drawer-redesign, ekran-01-38, ekran-01-docs2, ekran-01-docs3, ekran-01-templates, ekran-01-undo, ekran-02-main, ekran-08, ekran-08-lin, ekran-10-jobs, ekran-16, guvenlik-a-ga2, k11-tz, karar-001, merge-0927c, merge-account, otomasyon-4, pages-rule, proto-ref-pack, settings-merge, silinen-vardiya, tren-araci.
- **Not:** bazılarının içinde ana klasördeki ayar dosyasının (.env.local) birebir kopyası var. Bu, dosyaların parmak iziyle karşılaştırılarak doğrulandı; değerler okunmadı. Asıl dosya ana klasörde kalıyor.
- **Öneri: sil.**

### 2. Yerel dal adları (≈570 adet, yer tutmaz)
- **Ne:** eski işlerin dal adları.
- **Durum:**
  - 340'ı main'in içinde.
  - 229'u GitHub'da aynı hâliyle duruyor.
  - 120'si eski tren dalı (train/…).
- **Silinirse:** yalnız bilgisayardaki ad silinir; GitHub'dakiler kalır.
- **Öneri:** sil. Dokunulmayacaklar:
  - main ve coord/kayit2,
  - kalan çalışma klasörlerinin kullandığı dallar,
  - aşağıda ayrıca sorulanlar.

### 3. İki eski "kenara konmuş değişiklik" (stash)
- **Ne:** 7 Ekim öncesinden, Schedule'ın eski bir veritabanı işinin yarım denemeleri.
- **Durum:** bugün GitHub'a yedek adıyla gönderildi (yedek/2026-10-14/stash/…).
- **Öneri: sil.**

## Bölüm 2. Emin olamadıklarım (senin kararın)

### 4. Kayıt dışı kalmış eski ajan klasörleri (15 adet, ≈3.9 GB)
- **Yer:** `newfork-clean\.claude\worktrees\` altında, 25 Eylül – 4 Ekim.
- **Ne:** git artık bunları tanımıyor; yarım silinmiş çalışma kopyaları. Büyük kısmı indirilmiş paketler.
- **Neden emin değilim:** git'e bağlı olmadıkları için içlerini GitHub'la doğrulayamıyorum. Ama hepsi 10 günden eski ve hiçbir işe bağlı değil.
- **Öneri: sil.**

### 5. E-posta servisi anahtarı farklı olan 7 eski çalışma klasörü (≈3.7 GB)
- **Liste:** bl-1069, bl-176, bl-503, bl-969, edit-leave, ekran-03, important-dates-search.
- **Ne:** kodları GitHub'da. İçlerindeki ayar dosyasında e-posta gönderme servisinin anahtarı (RESEND_API_KEY) ana klasördekinden farklı. Değeri okumadım, yalnız farklı olduğunu gördüm.
- **Silinirse:** bu eski anahtar kopyaları gider. Ana klasördeki anahtar kalır.
- **Öneri: sil.** O eski anahtarı bir yerde kullanıyorsan önce söyle.

### 6. İçinde küçük kanıt klasörü olan 12 eski çalışma klasörü (≈4 GB)
- **Liste:** amazing-goldstine, funny-shannon, inspiring-bose, inspiring-diffie, optimistic-dewdney, optimistic-wilson, suspicious-mirzakhani, zealous-diffie, bildirim, ekran-02, ekran-02-pkg, oto-backlog.
- **Ne:** kodları GitHub'da. İçlerinde 1–15 MB eski ekran görüntüsü ve test kaydı var; işleri main'de.
- **Öneri: sil.**

### 7. Hafıza notları ya da yarım değişiklik içeren 15 çalışma klasörü (≈6 GB)
- **Ne:**
  - Alt ajanların öğrendiği notlar (10 klasör).
  - Yarım bir uçtan uca test işi (24 dosya).
  - Yalnız satır sonu farkı olan 3 klasör.
  - Bir log dosyası.
- **Durum:** bugün hepsi GitHub'a yedek adıyla gönderildi (yedek/2026-10-14/uncommitted/…).
- **Öneri: sil.** Ajan notlarının main'e taşınması ayrı küçük bir iş.

### 8. GitHub'da olmayan ama içeriği main'de olan 2 çalışma klasörü
- **Liste:** agent-adc5b7c7 (telefon treni), bl-995.
- **Ne:** son hâlleri GitHub'da değil, ama değişiklikleri main'e başka adla girmiş.
- **Öneri: sil.**

### 9. Telefon işinin eski bir dalı (claude/project-thread-h167lv, 9 Ekim)
- **Ne:** 9 commit. Onboarding'de telefon alanı işinin (TEL-2) bir ara hâli; GitHub'da yok.
- **Durum:** telefon işi main'de başka biçimde var.
- **Öneri:** GitHub'a yedek adıyla gönderip yerelden sil.

### 10. Ana klasördeki eski kanıtlar klasörü `artifacts\` (765 MB)
- **İçinde:**
  - prototype (439 MB),
  - görsel QA ekran görüntüleri (88 MB),
  - arayüz ajanı (68 MB),
  - repo-checkpoint (38 MB),
  - eski iş kanıtları.
- **Neden emin değilim:** Claude'un hafızası nf-backend raporlarının burada olduğunu söylüyor; tarihî kayıt değeri var. Bugün hiçbir işe bağlı değil.
- **Öneri:** hesap-devri klasörü kalsın, gerisi yeni hesap çalışmaya başlayınca silinsin.

### 11. Eski kod kopyaları `newfork-wt\discard-no-changes` ve `newfork-wt\ekran-02-ba` (490 MB)
- **Ne:** 29 Eylül ve 7 Ekim'de karşılaştırma için alınmış, git'e bağlı olmayan kopyalar. İçlerinde çoğunlukla paketler var.
- **Öneri: sil.**

### 12. `newfork-wt\` içindeki eski log ve betik dosyaları (≈400 küçük dosya)
- **Ne:** 1–14 Ekim arası kurulum, test ve tren kayıtları (…-install.log, …-gate.log, train-*.log).
- **Öneri: sil.** İşler bitti, sonuçları thread'lerde.

### 13. Canlı veritabanının 29 Eylül'deki tam yedeği
- **Dosyalar:** `newfork-wt\hosted-backup-2026-09-29-data.sql`, `hosted-backup-2026-09-29-schema.sql` (≈3 MB).
- **Ne:** canlı veritabanının o günkü verisi ve şeması. O günden beri şema onlarca kez değişti; içinde kişisel veri olabilir.
- **Öneri: sil.** Eski, kullanılamaz ve veri içerebilir.

### 14. Eski şema ve yama dosyaları
- **Dosyalar:** `newfork-wt\schema-base.sql`, `old-snapshot-migration.sql`, `acil-final.patch`, `bl682-kararlar.patch`, `nfdb-mem.patch`.
- **Ne:** 3–12 Ekim işlerinin ara dosyaları; işler main'de.
- **Öneri: sil.**

### 15. Önceki hesap devri yedeği `newfork-wt\devir-yedek-2026-10-08` (172 MB)
- **Ne:** 8 Ekim'deki devirde senin "sessionlar silinmesin" talimatınla alınan kopya: 11 oturumun geçici klasörü, koordinatör betikleri, iki işin kanıtları.
- **Bugün:** o işlerin hepsi main'de; yeni devir paketi var.
- **Öneri:** yeni hesap çalışmaya başlayınca sil.

### 16. `newfork-wt\yedek\` (41 MB, 13 Ekim)
- **Ne:** FB-6.7 arayüz denemesinin git paketi ve ekran görüntüsü zip'i. Senin seçtiğin FB-6.7 kararları main'de; bu paket yalnız denenip bırakılan hâli tutuyor.
- **Öneri: sil.**

## Bölüm 3. Korunanların salt okur incelemesi

### 17. Canlı veritabanı yedekleri (`newfork-wt\coord\artifacts\canli-*`, 26 klasör, her biri <1 MB, 11–14 Ekim)
- **Ne:** canlıya uygulanan her riskli değişiklikten önce, değiştirilen fonksiyonların eski tanımı ve uygulanan dosya.
- **Neye yarar:** bir değişiklik canlıda sorun çıkarırsa geri dönüş buradan yazılır.
- **Yer:** neredeyse hiç yer tutmuyor.
- **Öneri:** 14 Kasım'a kadar sakla, sonra sil.

### 18. Aynı klasördeki eski kayıtlar (Eylül sonu – 11 Ekim)
- **İçinde:**
  - archive-2026-09-30 (38 MB) ve archive-2026-10-01 (6 MB),
  - bl-990 (386 MB, bir e2e işinin CI kayıtları ve yedeği),
  - emp-001, g8a, g18, hosted-2026-09-30, koordinator, nf-arayuz gibi Eylül klasörleri,
  - bl-*-canli, db4-canli, k28-canli, s4-undo-canli gibi 9–11 Ekim canlı yedekleri.
- **Öneri:**
  - Eylül klasörleri ve bl-990: sil.
  - 9–11 Ekim canlı yedekleri: 17. maddeyle aynı tarihe kadar sakla.

### 19. Jobs worktree'si `keen-brahmagupta-8c4853`
- **Ne:** Jobs devir thread'inin çalışma klasörü.
- **Durum:** temiz; içeriği 13 Ekim'deki main ile aynı, kaybolacak bir şey yok.
- **Öneri:** Jobs thread'i bitince sil.

### 20. Hesap devri dosyaları (`newfork-pages\hesap-devri-2026-10-14` 355 MB, `artifacts\hesap-devri`)
- **Ne:** bugünkü devir paketi; arşiv kopyası hâlâ yazılıyor.
- **Öneri:** yeni hesap kurulup çalışmaya başlayınca sil. Öncesinde kesinlikle silinmemeli.

### 21. GitHub'daki bugünkü yedek dallar (`yedek/2026-10-14/*`, 28 adet)
- **Ne:** bugün GitHub'a gönderilen yerel işler.
- **Neye yarar:** yerel klasörler silinse bile bu işler geri getirilebilir.
- **Öneri:** 14 Kasım'a kadar sakla, sonra sil.

### 22. Korunan yerel dallar
- **task/ekran-02-c2r, task/ekran-02-c3, task/ekran-02-c2-css, task/ekran-03-c1a, task/arayuz-salt-hata:**
  - 6–8 Ekim Requests ve arayüz işleri.
  - Değişikliklerinin hepsi main'de; GitHub'da aynı adla duruyorlar.
  - **Öneri:** yerel adlarını sil.
- **task/avail-design:**
  - 4 Ekim Availability tasarım denemesi.
  - Main'de olmayan 1 commit'i GitHub'da archive/avail-design olarak birebir duruyor.
  - **Öneri:** yereli sil, arşiv kalsın.
- **task/bl-969-kurtarma:**
  - 9 Ekim kurtarma işi.
  - Main'de olmayan 5 commit'i var; GitHub'da duruyor.
  - **Öneri:** yereli sil, GitHub'daki kalsın.
- **keep/fb62-8-save-pattern, keep/nf-planlama-besleme-lib, keep/nf-planlama-memory:**
  - 30 Eylül ajan notları.
  - İkisi main'de. Birinin 2 commit'i bugün GitHub'a yedeklendi.
  - **Öneri:** yerelden sil.
- **train/* (120 dal):**
  - Her treni gösteren dallar.
  - Hepsi GitHub'da ve main'de.
  - **Öneri:** yerelden sil (son tren klasörü kalır).

### 23. GitHub'daki eski arşiv ve yedek dallar
- **İçinde:**
  - archive/* (6): mockup ve tasarım dalları.
  - backup/tanitim-sitesi/* (6): tanıtım sitesinin dört sürümü ve sayfaları.
  - backup/task/* (6), backup/ekran-01-* (7), backup/oturum-ozetleri, backup/tasarim-kaynaklari, backup/yedek-dallar-listesi.
- **Yer:** GitHub'da yer sorunu yok.
- **Öneri:**
  - tanıtım sitesi ve tasarım kaynakları: sakla (iş henüz yapılmadı).
  - backup/ekran-01-* ve backup/task/*: 14 Kasım'da sil (işleri main'de).

---

**Toplam açılacak yer:** öneriler kabul edilirse bilgisayarda yaklaşık 30 GB.

**Bu sırada dokunulmayacaklar:** Claude ayarları ve hafızası, yerel Supabase ve CI makinesi.
