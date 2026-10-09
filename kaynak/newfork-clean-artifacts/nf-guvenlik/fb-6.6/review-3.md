KARAR: ONAY @89d91f83

# FB-6.6 A1 + A2 — güvenlik ve kod incelemesi, tur 3 (yalnız fark)

İncelenen: `task/fb-6.6-a2` @ `89d91f83`; fark `a6dd4897..89d91f83` = 2 dosya: yeni
`supabase/migrations/20261006030000_unreviewed_uploads_stay_with_deciders.sql` ve `supabase/tests/documents_on_the_core.test.sql`.
Önceki üç migration ve A2 kodu değişmemiş (diff yalnız bu iki dosya). Başkasının worktree'sine dokunulmadı.

## Özet (kod okumayan için)
- Tur 2'deki Orta bulgu kapandı. Mert'in yeni kuralı da doğru uygulanmış: reddedilmiş yüklemeyi ve gerekçesini de yalnız karar verenler ve sahibi görüyor.
  Örnek: Zeynep, Deniz'in yenilemesini "Blurry photo" diye reddediyor. Eş müdür Ayşe Employees → Deniz → Documents'ta Food Handler'ı hâlâ geçerli görüyor;
  reddi, gerekçesini, reddedilen dosyayı, indirmeyi ve geçmiş kaydını görmüyor. Zeynep ve Deniz görüyor.
- Yeni bulgu: Kritik 0, Yüksek 0, Orta 0, Düşük 1 (bu dalda değişmeyen bir Schedule metni; ürün sorusu). Tur 1'in Düşük 1'i (owner yüklemesinde API / DB işaret farkı) hâlâ açık.

## Bulgular

### Düşük
1. **Schedule uyarısı karar veremeyen müdüre "rejected" / "pending review" kelimesini gösteriyor** — `app_private.document_shift_reasons`
   (bu dalda değişmedi; Schedule → vardiya çakışma uyarısı). Geçerli onayı olmayan kişide mesaj "Food Handler: rejected." ya da
   "Food Handler: pending review." oluyor ve `document_status` alanı aynı bilgiyi taşıyor. Dosya, gerekçe ve indirme sızmıyor. Ama Mert'in yeni kuralı
   reddi de karar verene ayırıyor; S2 cevabı Schedule'da yalnız "belge eksik" bilgisini bırakmıştı.
   Örnek: Veli'nin ilk Food Handler'ı reddedildi; Lale (belge okuyabilen ama karar veremeyen müdür) Schedule'da Veli'yi bir vardiyaya koyunca "rejected" yazısını görür.
   Öneri: Mert'e tek soru — karar veremeyen için Schedule mesajı "missing" mi olsun. Ya da kuralın birebir okumasıyla `nf-db` mesajı karar veremeyene
   "missing" diye versin. Bu işi durdurmaz; backlog'a yazılabilir.

## Görev mesajındaki sorular
1. **Sızıntı yolları.** Tek yardımcı `app_private.document_submission_visible` üç yerde aynı kuralı uyguluyor:
   - sürüm listesi;
   - geçmiş: gönderime bağlı olay, gönderim görünmüyorsa düşüyor; red kaydının gerekçesi bu yolla gidiyor;
   - indirme: her iki "görmüyor" durumu aynı `P0002` cevabını alıyor.

   `document_view` reddedilmiş son yüklemeyi de maskeliyor; satır özetinde ve onboarding incelemesinde `submitted_id`, `rejection_reason` ve durum karar veremeyene gizli.
   Onaylı sürüm yoksa satır "missing" ya da "grace" görünüyor, gerekçesiz. Öteki yollar:
   - red bildirimi yalnız çalışana gidiyor, inceleme bildirimi yalnız karar verene;
   - hesap sayacı yalnız kişinin kendi belgesini sayıyor;
   - `rejection_reason` okuyan öteki fonksiyonlar kişinin kendi çağrıları ya da karar verenin komutları.

   Schedule için Düşük 1.
2. **Kapalı varsayılan.** Kural izin listesi: `accepted` herkese (M2 okuyucusu), `pending_review`, `superseded`, `rejected` yalnız karar veren ve sahibe,
   `draft` ve adı geçmeyen her durum kimseye. Durum boş gelse de sonuç "görünmez".
3. **Karar veren ve sahip.** Kendi çağrısı (`self_only`) süzgeçten muaf. Karar veren üç durumu da görüyor ve indiriyor. Taslaklar eskisi gibi yalnız sahibinde.
   Testte Zeynep (karar veren) ve Deniz (sahip) olumlu hücrelerle duruyor.
4. **Güvenlik ayarları.** Yeni yardımcı `security definer`, `search_path = ''`, `revoke all … from public, anon, authenticated`.
   `document_view` ve servisler `create or replace` (önceki revoke ve ayarlar korunuyor).
5. **Testler.** 15 yeni hücre, olumlu ve olumsuz. Fix'siz 9 kırmızı, fix'le 76/76 yeşil (aşağıda).

## Kanıt
- `git diff a6dd4897 89d91f83` (2 dosya) ve yeni migration'ın tamamı okundu.
- Yerel DB, CI boşken (`gh run list`), `node scripts/lock.mjs take/release db` ile; iki ayrı tek-oturum `begin; … rollback;` koşusu:
  - dört migration + `documents_on_the_core.test.sql` (bu turun hâli): 1..76, `not ok` 0;
  - yeni migration olmadan aynı dosya: 9 kırmızı — 22, 23, 24 (değiştirilmiş yükleme: liste, geçmiş, indirme), 30–33 (red: gerekçe, liste,
    geçmiş, indirme), 74–75 (Lale: gerekçe, onboarding incelemesi). Kırmızıların hepsi yeni olumsuz hücreler; olumlu hücreler iki koşuda da yeşil.
- `app_private.document_shift_reasons` gövdesi okundu (Düşük 1).
