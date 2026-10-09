KARAR: ONAY @45f8ddfe

EMP-001 B4 + A3 + acil durum mesajı — tek tur görsel QA, 2026-09-30. Engelleyen bulgu yok. Bir "düzeltilmeli"
(koordinatörün gözlemi doğrulandı), beş "not". Test verisinde geri alınmayan iki şey var (en altta, "Veri").

## Nasıl bakıldı
- `origin/main` @ `45f8ddfe`, web 5616 / api 5617, ortak yerel DB; `db.lock` alındı ve bırakıldı. Test/build koşmadı.
- Veri: e2e artığı **"World e2e1790693406000"** (owner Olcay, müdür Ayse = Kadikoy, çalışan Emre ve Ali). Meyhouse'a girilmedi.
- Roller: owner, manager (Ayse), employee (Emre). Genişlik 1280 ve 390, light.
- Employee rolü Employees ekranına ulaşamıyor: `/app/employees` adresi onu kendi ana sayfasına (`/app/employee-hub`)
  götürüyor, çekmece açılmıyor (`31-employee-employees-route-1280.png`). Bu yüzden madde 1 ve 2 owner ve manager ile,
  madde 3 employee ile bakıldı.

## 1. B4 — Employees → kişi → çekmece → Access → "Workspace role"

| | Bakılan | Sonuç | Kanıt |
|---|---|---|---|
| a | Rol değişince "Save changes" | Rol seçimi artık istek göndermiyor (ağda yazma yok). "Save changes" etkinleşiyor; pasif hâli soluk (opaklık 0,55, "yasak" imleci), etkin hâli dolu yeşil — ayırt ediliyor. 1280 ve 390. | `10-owner-access-rest-1280.png`, `11-owner-access-role-draft-1280.png`, `…-390.png` |
| b | Rol taslağı varken "Terminate employee" | **Doğrulandı: pasif ama soluk görünmüyor** (bulgu D1). | `11-owner-access-role-draft-1280.png` |
| c | Yalnız rol kaydedilince | Çekmece **Access'te kalıyor**; rol kutusu yeni rolü gösteriyor; "Save changes" kısa süre "Done" yazıyor. 1280 ve 390. | `12-owner-role-saved-1280.png`, `…-390.png` |
| d | Esc / dışarı tıklama | İkisi de **uyarısız kapatıyor** (soru penceresi yok); yeniden açınca kayıtlı rol ("Employee") görünüyor, taslak gitmiş. Telefonda çekmece tam ekran, dışarı tıklanacak yer yok; Esc aynı. | ölçüm |
| e | Kişiyi çıkarma sonrası | Müdür Ayse, Ali'yi Kadikoy'dan çıkardı (iki tık): **çekmece kapandı, "Removed from Kadikoy" bildirimi çıktı**, Ali listeden düştü. Bildirim alt ortada, yeşil onay işaretli, kapatma düğmeli. | `21-manager-removed-closed-toast-1280.png` |
| f | Klavye sırası ve odak | Sıra: Close → Workspace role → Remove access → Terminate → Cancel → Save changes. Her durakta 2px yeşil odak halkası. Rol kutusu ok tuşlarıyla değişiyor, Esc kapatıyor. İki not: N2, N3. | ölçüm |

Manager görünümü: "Workspace role" kutusunda tek seçenek ("Employee"), "Remove access" yok, "Terminate employee" gri ve
kilit simgeli (pasif görünüm), "Save changes" pasif (`20-manager-access-1280.png`, `20-manager-access-390.png`).

## 2. A3 — aynı sekme → "Profile photo"
- Başlığın ve "Profile photo removal" satır adının altında **açıklama yok**. ✔
- "Remove photo": fare ipucu (`title`) ve ekran okuyucu açıklaması (`aria-describedby`) ikisi de
  **"Remove only the photo shown for this workspace."** ✔ Açıklama metni ekranda görünmüyor. ✔
- Fotoğraf yokken düğme **soluk** (opaklık 0,55, "yasak" imleci). ✔
- Hiza ve boşluk: başlık satırı "Account access" ile aynı hizada, satır adı ile düğme aynı yatay çizgide. Telefonda düğme
  **tam genişlik** (358px / 390). ✔
- İşçinin "after" görüntüsüyle (`…\goofy-wescoff-7931db\artifacts\nf-arayuz\emp-001-a3\after-employee-access-1280.png`)
  karşılaştırıldı: fark yok.
- Denenmeyen: fotoğrafı olan bir kişide düğmenin etkin hâli (bu dünyada fotoğraflı kişi yok).
Görüntü: `10-owner-access-rest-1280.png`, `11-owner-access-role-draft-390.png`, `20-manager-access-1280.png`.

## 3. Acil durum kişisi — Account → Profile → "Emergency contact"
Gerçek veriyle: çalışan Emre formu açık tuttu (Contact / Friend / 4155550100); owner başka oturumda Employees → Emre →
Access → "Remove access" → "Confirm remove access" yaptı; Emre Relationship'i değiştirip "Save"e bastı.
- Ekran: **"Your emergency contact can no longer be changed in World e2e1790693406000: your access there has ended or
  the workspace is closed."** "Try again." yok. ✔ (API yine 404 `authz.not_member` veriyor; ekran artık onu da "bitti" sayıyor.)
- Görünüm: `role="alert"`, 13px, kırmızı yazı beyaz zeminde, kontrast **6,8:1** (eşik 4,5:1). 1280'de iki satır, 390'da
  üç satır, "Save"in üstünde; yatay taşma yok.
- Aynı anda Emergency contact bölümü ekrandan kalkıyor ve "Save" pasifleşiyor; cümle ne olduğunu söylediği için artık
  çelişki yok.
Görüntü: `40-removed-member-contact-save-1280.png`, `41-removed-member-contact-save-390.png`.

## Komşu regresyon
Employees listesi (7 satır, "Manages …" yok), çekmecenin Profile ve Employment sekmeleri açılıyor, "Manages without working
there" hiçbir yerde yok, erişim-yok ekranı yok (`30-owner-list-1280.png`). Sayfa hatası (pageerror) görülmedi.

## Bulgular

**D1 — düzeltilmeli. Rol (ya da form) taslağı varken "Terminate employee" pasif ama etkin görünüyor.**
Employees → kişi → çekmece → Access, owner. Rol "Manager" seçilince:
- Düğme gerçekten pasif (`disabled`; `aria-disabled` yok), tıklanmıyor.
- Görünüm değişmiyor: aynı kırmızı yazı, opaklık 1, imleç "el"; fareyle üstüne gelince açık kırmızı zemin bile çıkıyor.
- Neden pasif olduğu yalnız `title`'da: "Save your changes before terminating the employee". Klavye pasif düğmeyi
  atlıyor (sıra: Remove access → Cancel), yani klavye ve ekran okuyucu kullanıcısı bu ipucuna ulaşamıyor.
- Aynı düğme manager'da pasifken gri + kilit simgeli çiziliyor (`20-manager-access-1280.png`); iki pasif hâl birbirini
  tutmuyor.
Öneri: taslak varken de o pasif görünüm (gri, kilit, "yasak" imleci) ve ipucunun görünür ya da `aria-describedby` ile
bağlı olması. Görüntü: `11-owner-access-role-draft-1280.png` (fare düğmenin üstünde).
Not: davranış B4'ten önce de form taslağında böyleydi; B4 onu rol taslağına da taşıdı. Telefonda bu düğme hiç yok.

**N1 — not. Yalnız rol kaydedilince geri bildirim yalnız düğmedeki "Done".** Bildirim ya da durum satırı çıkmıyor
(canlı bölge boş). Gören için yeterli; ekran okuyucu kaydın bittiğini duymayabilir. Öneri: kısa bir bildirim
("Role saved") ya da `role="status"`. Görüntü: `12-owner-role-saved-1280.png`.

**N2 — not (B4'ten bağımsız, eski). Düzenleme çekmecesi odağı içinde tutmuyor.** Son düğmeden ("Cancel" / "Save changes")
sonra Tab arkadaki soluk sayfaya geçiyor ("Collapse menu", kenar menüsü…). Çekmece `aria-modal="true"`; odak tuzağı kodda
yalnız "Add employee" kipinde çalışıyor (`apps/web/src/employees/EmployeeDrawer.tsx`, `onKeyDown`, `if (!props.creating …)`).
WCAG 2.4.3. Backlog adayı (leave: medium / do: safe).

**N3 — not. Çıkarma sonrası çekmece kapanınca odak sayfa gövdesinde kalıyor.** Müdürün çıkardığı kişinin satırı da
listeden gittiği için odak `body`'ye düşüyor; sonraki Tab sayfanın başından başlıyor. Öneri: odağı listeye ya da arama
kutusuna vermek.

**N4 — not. Manager'da "Workspace role" tek seçenekli ama açılır kutu gibi duruyor.** Değiştirilemeyen bir değer
düzenlenebilir görünüyor. Öneri: düz metin ya da pasif kutu. `20-manager-access-1280.png`.

**N5 — not (önceki turdan süren). "Remove access" dinlenirken dolu kırmızı;** aynı çekmecedeki lokasyon "Remove"u açık
kırmızı başlıyor, basınca doluyor. Telefonda çekmecede "Terminate employee" yok. İkisi önceki raporda da yazıldı.

## Veri — ne yazıldı, ne geri alındı
Hepsi "World e2e1790693406000" içinde (builder kişileri).

| Kayıt | Yapılan | Geri alındı mı |
|---|---|---|
| Emre Person (E-0003) | Rol Employee → Manager → Employee, iki kez (1280 ve 390) | Evet, "Employee". Kayıt sürümü 6 → 10, tarihçe satırları kaldı. |
| Ali Person (E-0006) | Ayse tarafından Kadikoy'dan çıkarıldı | Evet, owner Kadikoy'u birincil olarak geri ekledi. **2 yayımlanmış vardiya sahipsiz kaldı, geri alınmadı.** Sürüm 3 → 5. |
| Emre Person (E-0003) | **Erişimi alındı** (madde 3) | **Hayır.** Geri vermek yeniden davet ister; davet bu makinede gerçek e-posta servisiyle (Resend) gidiyor, kullanıcı izni olmadan göndermedim. Acil durum kişisi değişmedi ("Friend"). |

Bu dünyada giriş yapabilen çalışan olarak Ali kaldı (Deniz ve Emre'nin erişimi alınmış durumda).

## Süreçler ve kilit
Dev sunucuları (07:22'de açılan iki ağaç, `tsx watch` dahil) PID ile kapatıldı: süreç 0, 5616/5617 boş. `db.lock`
bırakıldı (`lock.mjs status`: boş). Worktree temiz, commit yok.

## Skills
`design:accessibility-review` ölçütleri uygulandı (kontrast, klavye, odak, canlı bölge, ad/rol/değer).
`chrome-devtools-mcp:a11y-debugging` kullanılamadı: o sunucu bu oturumda bağlanamadı.
