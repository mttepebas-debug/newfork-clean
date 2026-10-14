# Devir raporu: Takas kırmızı düğmeler (vardiya bırakma, cover, swap)

Yazıldı: 2026-10-14 ~09:50 California. Yazan: bu thread'in Claude'u.

## 1. Thread adı ve amacı
- **Ad:** "Takas kırmızı düğmeler" (eski hesapta proje thread'i).
- **Amaç:** Önce Takas ekranındaki reddet/kapat düğmelerini kırmızı ve iki tıklı yapmak (bitti, main'de). Sonra Mert'in isteğiyle (2026-10-13): çalışanın vardiyasını bırakması (pickup), başkasından cover istemesi ve iki çalışanın vardiya değiştirmesi (swap) için **plan + tıklanır mockup**. Telefon öncelikli; müdür sağ çekmecede karar verir.
- **Kural:** Bu plan için **kod yok**, Mert "kodla" diyene kadar.

## 2. Biten işler (hepsi main'de)
- Takas'ta reddet/kapat düğmeleri kırmızı ve iki tık (377df776), test açıklaması (6247350b), plan kaydı (9556b0c3).
- Shift Hub: Available Shifts sekmesi ve altı çizili sekmeler (6ded8c08); My requests'te bekleyen cevap için kırmızı sayı (9d9ac751); alabileceğim açık vardiya sayısı ve sayfa kaydırma çubuğunun gizlenmesi (fff13cbf).
- Mockup ve plan işi git'te değil, proje dosyalarında (aşağıda).

## 3. Yarım kalanlar ve sıradaki adım
1. **Plan "kodla" bekliyor.** Plan: [PLAN.md](/mnt/project-files/notes/vardiya-degisim/PLAN.md). Karar tablosu UTC saatli; yeni karar oraya yazılır.
2. **Mockup yeniden yayını bekliyor.** 08:30–10:34Z değişiklikleri kaynakta var, yayında yok (günlük 200 yayın sınırı doldu). Eski hesapta 17:05 California (2026-10-15 00:05Z) için kendine uyandırma kuruldu. Yeni hesapta bu çalışmaz: yeni hesap mockup'ı **kendi hesabında yeni bir Artifact olarak** yayınlar (eski linki göremez/güncelleyemez). Kaynak: `/mnt/project-files/pages/vardiya-degisim-mockup.html` (önce `gorsel-kararlar/gelen/vardiya-degisim/index.html` oraya kopyalanır).
3. **Eski Artifact'taki 11 açık yorum** yayından sonra kapatılacaktı (eski hesapta). Hepsine cevap yazıldı; içerikleri kaynağa işlendi. Yeni hesapta yapılacak bir şey yok; eski hesapta açık kalabilirler.
4. **Meyhouse demo verisi canlıda** (Palo Alto, 19–25 Ekim haftası, test için). Mert'e "testten sonra silelim mi?" teklifi açık. Silme canlı veri silmedir: Mert'in kendi yazılı "evet"i ve PC thread'i gerekir.
5. **KARARLAR taslağı trende bekliyor:** izinli güne vardiya alma/swap kuralı, [kararlar-taslak-izinli-gun.md](/mnt/project-files/notes/vardiya-degisim/kararlar-taslak-izinli-gun.md). Koordinatöre verilmişti; `docs/plan/KARARLAR.md`'de olup olmadığı kontrol edilmeli.
6. **Açık sorular (Mert'e):**
   - Davet edilen kişinin kendi haftalık saatleri swap çekmecesinde gösterilsin mi?
   - Masaüstü kaydırma çubuğu her sayfada gizlensin mi? (Shift Hub'da gizlendi; eski Artifact yorumu.)
   - İzin (time off) satırları da aynı cümle düzeninde mi olsun?
   - Swap çekmecesi v4 son hali Mert'in onayında.

## 4. Mert'ten beklenenler
- Plan için "kodla" (ya da düzeltme).
- Yeni hesaptaki mockup yayınını görüp yorumlaması.
- Meyhouse demo verisi: sil / kalsın.
- Yukarıdaki 4 açık soru.

## 5. Dal ve git durumu
- Dal: `claude/bl-748-exchange-destructive-buttons-d9tkly`, son commit `de47671e`, origin'le aynı.
- **Push edilmemiş iş yok.** Daldaki üç commit'in eşleri main'de (fff13cbf, 9d9ac751, 6ded8c08); dal silinebilir durumda (silme kararı koordinatörün).
- Mockup işi git'te değil: `/mnt/project-files` altında.

## 6. İlgili dosyalar
- Plan: [PLAN.md](/mnt/project-files/notes/vardiya-degisim/PLAN.md)
- KARARLAR taslağı: [kararlar-taslak-izinli-gun.md](/mnt/project-files/notes/vardiya-degisim/kararlar-taslak-izinli-gun.md)
- **Mockup kaynağı (asıl):** [index.html](/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html), tek dosya, 17 rehber anı.
- Yayın kopyası: [vardiya-degisim-mockup.html](/mnt/project-files/pages/vardiya-degisim-mockup.html) (son yayından eski; önce kaynaktan kopyala)
- İndirilebilir kopya + zip: `/mnt/project-files/pages/vardiya-degisim-indir/` (Mert'in bilgisayarında açılır test sürümü)
- Eski telefon görünümü yedeği: `/mnt/project-files/pages/vardiya-degisim-indir/yedek-2026-10-14-satirlar/`
- Son ekran görüntüleri: `/mnt/project-files/pages/vardiya-degisim-indir/satir-cumleleri/` (1–7)
- Eski görüntüler: `vardiya-degisim-indir/swap-v3/`, `swap-v4/`, `ikonlar/`
- İkon adayları (karar verildi): [vardiya-ikonlari/index.html](/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-ikonlari/index.html)
- Yardımcı betikler ve ara yedekler (eski oturumun geçici klasöründen kopyalandı): `/mnt/project-files/devir/threadler/takas-kaynak/`
  - `scripts/vdbuild.py`: indirilebilir kopya + zip üretir. `vdshot.mjs`: 17 anı 1440 ve 390'da. `vdrows.mjs`: her satıra tıklama + onay/red. `vdfrz.mjs`: sabit başlık kontrolü. `vdtab3.mjs`, `vdr5.mjs`: tablo ve r5 çekmecesi. Betiklerdeki yollar eski geçici klasörü gösterir; yeni yerde yol düzeltilmeli. Playwright: repo `node_modules/.pnpm/playwright@…`, tarayıcı `/opt/pw-browsers/chromium`.
  - `yedekler/vd-index-before-*.html`: her değişiklikten önceki mockup hali; `yedekler/*.png`: tablo görüntüleri.

## 7. Artifact'lar
| Ne | Link (eski hesap) | Kaynak |
|---|---|---|
| Vardiya değişim mockup (v2 yayında) | https://claude.ai/artifact/723BAcPXjhxwYePzqDGSxk | `/mnt/project-files/pages/vardiya-degisim-mockup.html` ← `gorsel-kararlar/gelen/vardiya-degisim/index.html` |

Liste: `/mnt/project-files/pages/LISTE.md`. Yeni hesap yeni link alır; LISTE.md'ye yeni satır yazılır, eski link silinmez.

## 8. Taşınacak bulgular, kurallar, çıkarımlar
- **Satır cümlesi:** ikon (Pickup = kalkmış el, Cover = adım atan kişi, Swap = iki ok; 40 px kutu, 22 px çizim, masaüstü ve telefonda aynı) + tek cümle, yeni çalışacak kişinin adıyla başlar. Kim çıkar kim girer hep belli: pickup/cover'da sahibi çıkar.
  - Pickup: "Sam Reed and 2 others want to take over Maria's 4:00 PM Server shift at Downtown on Fri, Oct 16." Tek kişi: "wants". Onaylanınca "took over".
  - Cover: "offered to cover"; onaylanınca "is covering".
  - Swap: "X and Y want to swap their Server shifts."; telefonda "want to swap shifts".
- **Tablo:** satırlar bildirim gibi ince, tek cümle; ayrıntı çekmecede. "Waiting" sütunu yerine **Expires**: süre = vardiya başlangıcı − 4 saat (swap'ta erken olan vardiya); son 12 saatte kırmızı. Satırlar en yakın süreye göre sıralı.
- **Durumlar yalnız:** Needs decision / Approved / Declined / Expired. Aday sayısı yazılmaz. "Approved by you…", "Closes …", "Your manager picks…" metinleri yok. Tek istisna: swap'ta bir müdür onaylayıp öbürü karar vermediyse **"Waiting for Midtown"** (Mert 10:34Z).
- **Swap reddi:** iki lokasyonlu swap'ta tek müdürün reddi yeter; anında Declined, istek kapanır (Mert 10:29Z).
- **Sabit başlıklar:** Shift Hub başlık+sekmeler, Who's working başlığı+gün şeridi, müdür telefon Requests başlığı+sekmeler kayarken sabit.
- **Telefon kartı:** olabildiğince sade; ayrıntı dokununca.
- **İzinli gün:** müdür onaylı izne vardiya koyamaz; çalışan kendi isteğiyle pickup/cover/swap ile izinli güne girebilir (uyarı; onayla o günün izni iptal, müdüre ayrı bildirim yok; çok günlük izinde yalnız o gün).
- Mert'in metinleri örnektir: doğru SaaS İngilizcesiyle yeniden yazılır. "Click here" yok.
- Mockup kontrolü: her değişiklikten sonra 17 anı 1440 ve 390'da, hata ve yatay taşma olmadan.
- Artifact yayın sınırı günde 200 ve hesap geneli; yalnız içerik değişince yeniden yayınla.
- Bu thread'in ek dosya sınırı (24) dolmuştu: dosyalar metinde link olarak verildi.

## 9. Yeni hesap thread'i için hazır brief taslağı
```
İŞ: Takas (vardiya bırakma, cover, swap) planı ve mockup'ı devralma.
Önce oku: /mnt/project-files/devir/threadler/takas.md (bu rapor) ve /mnt/project-files/notes/vardiya-degisim/PLAN.md.
Yapılacak:
1. /mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html dosyasını
   /mnt/project-files/pages/vardiya-degisim-mockup.html'e kopyala, 17 anı 1440 ve 390'da kontrol et
   (betikler takas-kaynak/scripts/, yolları düzelt), sonra bu hesapta yeni Artifact olarak yayınla;
   linki LISTE.md'ye ekle ve Mert'e Türkçe tek satırla gönder.
2. Mert'e açık soruları karar kartıyla sor (rapor §3.6) ve Meyhouse demo verisinin silinip silinmeyeceğini sor
   (silme yalnız Mert'in yazılı "evet"iyle, PC thread'inde).
3. KARARLAR taslağının (notes/vardiya-degisim/kararlar-taslak-izinli-gun.md) main'de olup olmadığını kontrol et; yoksa trene öner.
Kod yok: Mert bu plan için "kodla" diyene kadar. Yeni karar PLAN.md'nin karar tablosuna UTC saatle yazılır.
Dokunma: başka thread'lerin dosyaları (ShiftCard/ScheduleRow, Lineup, Jobs). Dal: güncel origin/main'den yeni claude/ dal; force push yok.
```

## GÜVENLİ DEĞİL
Yok. Push edilmemiş iş yok; parola veya token içeren dosya kopyalanmadı (betikler tarandı).
