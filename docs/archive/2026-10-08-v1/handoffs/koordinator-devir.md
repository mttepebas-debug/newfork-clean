# Koordinatör devir notu

Tarih: 2026-09-25. Kimden: "Koordinatör" oturumu (2026-09-24'ten beri kullanıcının tek muhatabı).
Kime: `nf-strateji` lead'i (Genel Koordinatör). Program durumu için ayrıca
`docs/plan/handoffs/FOUNDATION-B-asama6-devir.md`'yi oku; bu not onu tekrar etmez.
Çalışma kuralları için `docs/teams/koordinator-mirasi.md` (kullanıcının koordinatöre öğrettikleri).

## 1. Kullanıcıda bekleyenler
- **"FX: sil"**: yerel ortak DB'de eski bir testin bıraktığı "FX" deneme işyeri (BL-100, ~230 satır).
  Kullanıcı silinmesini onayladı, ama onay işi yapacak oturumun penceresine yazılmalı. Yedek:
  `C:\Users\TheWe\Documents\Codex\backups\local-db-before-fx-cleanup-20260924.dump`.
- **SEC-001**: hosted'da `anon_exec` açık; kullanıcı Supabase'e hatırlatma talebi gönderdi
  (2026-09-25), cevap bekleniyor. Bekçi kurulu.
- **Yerel `supabase db reset`**: hiç koşulmadı (kullanıcı onayı ister). Seed değişiklikleri ortak
  yerel DB'ye yansımıyor; CI her koşuda sıfırdan kuruyor.
- **`docs/rebuild/` (ana klasörde, git dışı)**: 7 Eylül'den kalma 527 eski kanıt dosyası, arşive
  taşınırken geride kalmış. Kullanıcıya silmek isteyip istemediği soruldu, cevap yok.
- **Runner'ların açılışta kendiliğinden gelmesi**: gerçek bir Windows yeniden başlatmasıyla henüz
  kanıtlanmadı. Kullanıcı bilgisayarı yeniden başlattıktan sonra runner'ların online olduğunu kontrol et
  (`gh api repos/mttepebas-debug/newfork-clean/actions/runners`).

## 2. Bu dönemde verilen kullanıcı kararları (kayıtları)
- CI GitHub'dan kullanıcının bilgisayarına taşındı (BL-107, BL-112; KARARLAR OPS-01). Actions harcama
  limiti $0.
- Aşama 4 kararları (plan kilidi A, izinler 1A–6A, eski kapılar ekran ekran) ve Aşama 5 silme onayları
  FOUNDATION-B.md ve KARARLAR "Ürün kuralları"nda.
- BL-080 (owner'ın resmî adı): sihirbaz 1. adım, zorunlu, kopyalama yok, sonradan değişiklik denetim
  kaydıyla → Aşama 6 Belgeler dilimi (BACKLOG'da).
- Leaked password protection açılmayacak (ücretli). Realtime public erişim kapalı (BL-114 ile kanallar
  private).
- Eski proje (`theweiwuer3-glitch/newfork`) kullanılmıyor; WSL'deki üç runner servisi durdurulup
  kapatıldı. Depoda yalnız `main` var; yedek etiketlerin hepsi kullanıcı kararıyla silindi.

## 3. Oturumlar
- FOUNDATION-B oturumu devir notunu yazdı ve kapatılıyor. Başka açık worker oturumu yok.
- Koordinatörün `C:/Users/TheWe/Documents/Codex/newfork-wt/coord` adlı ayrık worktree'si var
  (yalnız docs için kullanıldı). Koordinatör kapanırken kaldırılır.
- Kullanıcı ara sıra takım dışı tekil oturum açıyor (ör. "Backlog görevleri kontrol",
  "Durum güncellemesi ve kontrol"). Bunlar CLAUDE.md'ye göre kullanıcıyla doğrudan konuşur;
  raporlarını sana yönlendirmesini isteyebilirsin.

## 4. İlk adım önerisi
Kullanıcıya ilk özetinde FOUNDATION-B Aşama 6 Schedule pilotunu ve dilim başındaki ekran turunu öner.
Turu kullanıcıyla sen yürüt: Tasarım bakılacak yerleri ve soruları hazırlar, sen tek mesajda sorarsın.
