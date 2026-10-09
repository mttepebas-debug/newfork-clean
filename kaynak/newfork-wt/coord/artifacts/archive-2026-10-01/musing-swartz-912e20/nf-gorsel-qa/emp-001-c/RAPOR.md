KARAR: ONAY @62cfd10c

EMP-001 C görsel QA — `origin/task/batch-t11` @ `62cfd10c`, 2026-09-30, main'e girmeden önce. Engelleyen yok.
Bir "düzeltilmeli" (main'i tutmaz), altı "not". Veri değişmedi.

## Nasıl bakıldı
- Web 5616 / api 5617, ortak yerel DB (C migration'ı uygulanmış). Test/build koşmadı. `db.lock` alınmadı: bilerek yazan
  işlem yok; tek gerçek kayıt denemesi (madde 7) sunucu tarafından reddedildi.
- Veri: e2e artığı "World e2e1790693406000" (owner Olcay; müdür Ayse = Kadikoy; Ali, Zeynep…). Meyhouse'a girilmedi.
- Roller: owner, manager (Ayse). 1280 ve 390, light.
- **Tarayıcıda değiştirilen cevapla görülenler** (DB'ye yazı yok) ayrıca işaretli: madde 4'ün ikinci yarısı, madde 6,
  madde 7'nin başlangıç durumu.

## Madde madde sonuç

| # | Bakılan | Sonuç | Kanıt |
|---|---|---|---|
| 1 | **Owner'ın kendi kaydı → Employment** | Jobs: Management altında "Owner" işaretli + kilitli, adı soluk (**5,55:1** — işçinin ölçümüyle aynı), yanında "Primary" yok; "Manager" sıradan kutucuk, tıklanınca "Primary" geliyor ve seçili oluyor. Locations: iki lokasyon da işaretli + kilitli, adlar soluk (5,55:1), hiçbir satırda "Primary" yok, başlıkta "Required" **yok**. İpuçları: "Only the workspace owner holds the Owner job." / "The workspace owner works at every location." — hem fare ipucu (`title`) hem ekran okuyucu açıklaması (`aria-describedby`). Alt çubukta "Terminate employee" yok (owner). 1280 ve 390; manager da aynısını salt okunur görüyor (yalnız kendi lokasyonu). | `10-owner-owner-employment-1280.png`, `10-owner-owner-employment-390.png`, `11-owner-own-manager-ticked-1280.png`, `10-ayse-owner-employment-1280.png` |
| 2 | **Owner olmayan kişi (müdür Ayse) → Employment** | "Owner" işaretsiz + kilitli + soluk, aynı ipucu. "Manager" tıklanabilir; tek işken birincil oluyor; yanına "Server" eklenince ikisinde de "Primary" var, seçim Manager'da kalıyor. Locations'ta "Primary" ve "Required" duruyor. Kilitli satırla "Remove"lu satır: bkz. N3. | `10-owner-ayse-employment-1280.png`, `12-owner-ayse-manager-server-1280.png`, `10-ayse-ali-employment-1280.png` |
| 3 | **Alt çubuk → "Terminate employee" (D1)** | **Düzeltilmiş.** Owner, Ayse'nin formunda taslak varken: düğme gri (`rgb(95,107,102)`), kilit simgeli, imleç "yasak", fareyle üstüne gelince zemin çıkmıyor; `disabled`; `title` ve `aria-describedby` "Save your changes before terminating the employee". Manager'daki pasif hâlle **aynı sınıf, aynı renk, aynı simge, aynı imleç**; yalnız cümle farklı ("Only an admin or the owner can terminate an employee."). Taslak atılınca kırmızı, etkin hâline dönüyor. Telefonda bu düğme hiç yok (önceki turlardaki gibi), orada bakılamadı. | `13-owner-terminate-draft-hover-1280.png`, `14-manager-terminate-passive-1280.png` |
| 4 | **Schedule → Settings → "Sort Employees by: Job/Position"** | Gerçek veriyle: gruplar Cook, Server, **Owner en altta**; owner tek satır, Owner grubunda. Manager'da (Ayse) aynı sıra. "Manager" ve "Unassigned job" grupları bu veride yok; **tarayıcıda değiştirilen cevapla** (iki müdür Manager işine, bir kişi işsiz) sıra: Cook → Server → **Unassigned job → Manager → Owner**. 1280 ve 390. Sıralama seçimi sonra "A-Z"ye geri alındı (sunucuya yazı gitmedi). | `20-owner-schedule-by-job-1280.png`, `20-ayse-schedule-by-job-1280.png`, `21-owner-schedule-by-job-management-last-1280.png`, `…-390.png` |
| 5 | **Settings → Jobs** | Management altında "Manager" (0 kişi) ve "Owner" (1 kişi); "2 jobs". Sıra ada göre (Manager, Owner) — istendiği gibi yalnız not. | `30-owner-settings-jobs-1280.png` |
| 6 | **Kurulum sihirbazı 3. adım "What jobs do people work?"** | **Tarayıcıda değiştirilen cevapla** bakıldı (aşağıda "Madde 6 nasıl açıldı"). Yalnız Management varken: "1 department · 2 jobs", form başlığı **"Add a department"**, **Continue kapalı**. Management dışı bir departman + iş varken: form "Add a job", **Continue açık**. | `41-onboarding-step3-management-only-1280.png`, `42-onboarding-step3-with-kitchen-1280.png` |
| 7 | **Ret cümlesi** | Birincil işareti ekrandan kaldırılamıyor: radyo düğmesi, basınca seçili kalıyor; birincil iş kaldırılınca birincil kalan işe geçiyor. Bu yüzden başlangıç durumu **tarayıcıda** kuruldu (Ayse'nin kaydı "işi var, birincili yok" diye okundu), not alanı değiştirilip "Save changes" basıldı: **sunucu reddetti** (400, `employee.primary_job_required`), alt şeritte `role="alert"` ile **"Mark one of the jobs as primary, or turn on Remote or Exclude from schedule."** Ayse'nin kaydı değişmedi (sürüm 3, not boş, Cook birincil — SELECT ile doğrulandı). | `50-owner-no-primary-job-refused-1280.png` |

**Komşu regresyon:** Employees listesinde owner satırının Job sütunu "Owner" (`31-owner-list-1280.png`). Çekmecenin Profile ve
Access sekmeleri owner kaydında ve Ayse'de açılıyor, hata yok. Sayfa hatası (pageerror) görülmedi.

**Madde 6 nasıl açıldı:** yerel DB'de kurulumu bitmemiş 119 workspace var, hepsi 1. ya da 2. adımda; 3. adımda duran yok.
3. adıma gerçekten geçmek lokasyon eklemeyi ve adım kaydını gerektirir (veri yazar), yeni workspace de kurulmadı. Onun yerine
e2e artığı bir taslak workspace'in owner'ıyla girildi, sunucunun cevabındaki adım numarası **yalnız tarayıcıda** 3 yapıldı,
tarayıcıdan çıkan her yazma isteği engellendi. İkinci durumda (departman + iş) liste cevabına tarayıcıda bir "Kitchen /
Cook" eklendi. Yani görülen şey ekranın bu iki veriyle nasıl davrandığı; gerçek "ekle → Continue açılır" tıklaması denenmedi.

## Bulgular

**D1 — düzeltilmeli (main'i tutmaz). Sihirbazın 3. adımında Continue neden kapalı, ekran söylemiyor.**
Kurulum sihirbazı → "What jobs do people work?", yalnız Management varken. Görünen: "1 department · 2 jobs" rozeti, soluk
Continue, "Add a department" formu; "önce kendi departmanını ve bir işini ekle" diyen bir cümle yok. Kişi iki işi
görüp neden ilerleyemediğini anlamayabilir. Öneri: Continue'nun yanında ya da form başlığının altında kısa bir cümle
(ör. "Add a department and a job your team works to continue."), düğmeye `aria-describedby` ile bağlı.
Görüntü: `41-onboarding-step3-management-only-1280.png`.

**N1 — not. Sihirbazda Management satırında "Rename" ve "Remove" düğmeleri etkin görünüyor.** Sistem departmanı;
basılınca ne olduğu denenmedi (yazma). Reddediliyorsa düğme görünmemeli ya da pasif olmalı. Aynı görüntü.

**N2 — not. Owner'ın kendi kaydında Jobs başlığı "Required" diyor**, oysa tek zorunlu iş (Owner) kilitli ve hep işaretli;
Locations'ta "Required" kaldırılmış, Jobs'ta duruyor. Tutarlılık için bakılabilir. `10-owner-owner-employment-1280.png`.

**N3 — not. İki farklı "kilitli" görünüm yan yana.** Owner işi kilitliyken adı soluk; kayıtlı lokasyon (yanında "Remove")
kilitliyken kutusu gri ama adı koyu. Anlamları farklı (biri hiç değişmez, öteki "Remove" ile değişir), bu yüzden
engel değil; ipucu yalnız Owner satırında var. `12-owner-ayse-manager-server-1280.png`.

**N4 — not. Telefonda "Remove"lu lokasyon satırı 48px, öteki satırlar 38px** (düğme telefonda daha yüksek). Önceki
turların telefon görüntülerinde de düğme bu boydaydı; bu dalın getirdiği bir şey gibi durmuyor.

**N5 — not. Kilitli kutuların ipucu klavyeyle görülemiyor:** pasif kutuya odak gelmiyor, `title` yalnız fareyle çıkıyor.
Ekran okuyucu açıklamayı `aria-describedby` ile alıyor; yalnız klavye kullanan gören kişi alamıyor. Soluk ad kontrastı
5,55:1, eşiğin üstünde.

**N6 — not (eski). Settings sayfalarında iç içe iki `main` bölgesi var** (`app-main` içinde `settings-content`); ekran
okuyucuda iki "ana bölge". Bu daldan bağımsız.

## Veri
Bu turda hiçbir kayıt değişmedi. Tek gerçek kayıt isteği (madde 7) reddedildi; madde 6'da yazma istekleri tarayıcıda
engelliydi ve hiçbiri tetiklenmedi. Schedule sıralama seçimi sunucuya yazmıyor; "A-Z"ye geri alındı. Önceki turlardan
kalanlar (Emre ve Deniz'in erişimi alınmış) aynen duruyor.

## Süreçler
Dev sunucuları (08:05'te açılan iki ağaç, `tsx watch` dahil) PID ile kapatıldı: süreç 0, 5616/5617 boş. Worktree temiz,
commit yok. `main.lock` koordinatörde, dokunulmadı.

## Skills
`design:accessibility-review` ölçütleri uygulandı (kontrast, ad/rol/değer, açıklama bağları, klavye). Alt ajan kullanılmadı.
