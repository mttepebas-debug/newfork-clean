# G18 dilim a + b — rapor (İşçi: G18 Belgeler, nf-backend)

2026-09-30. Branch `task/g18-a` (push yok), worktree
`C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\agitated-bartik-839c9b`.
Commit'ler: `be8d5447` (dilim a, düzeltme + testleri), `7430a99f` (dilim b, üç komutun testi). Taban `origin/main` `5502dff7`.

## 1. Nerede duruyor
Bitti. Dilim a ve b'nin "Done when" maddelerinin hepsi sağlandı; tam kapı yeşil; tek bağımsız inceleme "OK";
gerçek uygulamada önce/sonra denendi. Main'e alınmayı bekliyor.

## 2. Ne yapıldı (etkisi)
**Belge çekmecesi** (bir belge satırına tıklayınca sağdan açılan pencere; Account → Documents, Employees →
Documents ve Employees → kişi → Documents'tan açılır) artık kişinin yazdığını silmiyor.

Örnek: garson Emre Account → Documents'ta "G18 check" belgesini açar, ön yüzü yükler, son kullanma tarihine
1 Mart 2027, "License number"a A-123 yazar, sonra ikinci dosyayı yükler. Eskiden ikinci yüklemede iki alan
boşalıyordu; şimdi yerinde kalıyor ve "Submit document" ikisini de gönderiyor. Aynı şey taslaktan dosya silince
("Remove …") ve erteleme nedeni kaydedince ("Save reason") de geçerli.

Kural (kodda `apps/web/src/documents/DocumentReviewDrawer.tsx`):
- Yazılan tarih ve ek alanlar, her komutta yeniden kurulan içeriğin dışında tutuluyor ve **yazıldığı taslak
  sürümün kimliğine** bağlı. Taslak aynı kaldıkça yazılan geçerli.
- Hiçbir şey yazılmadıysa taslağın kayıtlı değeri görünür (reddedilen sürümden açılan düzeltme taslağı eski
  tarihi taşır).
- Başka bir taslak gelirse (başka sekmede gönderildi, reddedildi, düzeltme taslağı açıldı) ya da çekmece
  "Next" ile başka belgeye geçerse yazılan bırakılır; geri dönünce de geri gelmez.
- Veritabanı, API ve shared'a dokunulmadı; sayaç ("başkası değiştirdi mi" kontrolü) aynen duruyor.

**Dilim b:** çekmecenin hiç sınanmayan üç komutu artık testle kilitli: dosya indirme, belge saat dilimi
("Save document time zone"), teslim süresini uzatma ("Extend deadline").

### Kanıt
| Ne | Sonuç |
|---|---|
| Önce kırmızı (düzeltmesiz kod, `DocumentReviewDrawer.test.tsx`, "typed draft fields") | 4 hücre kırmızı: ikinci yükleme, dosya silme, erteleme sonrası alanlar `{expiry:'', license:''}`; komuttan sonra kapatırken "Discard unsaved changes?" çıkmıyor. 4 koruma hücresi o gün de yeşil (aşağıda) |
| Ara adım | Durum yalnız taslak kimliğine bağlanınca "başka belgeye gidip dönme" hücresi kırmızıya düştü (yazılan geri geldi); çekmece belge kimliğiyle anahtarlanınca yeşil |
| Dilim b testleri işe yarıyor mu | Üretim kodu bilerek bozuldu (indirmede iki kimlik yer değiştirdi, saat diliminde yanlış sayaç, uzatmada sabit gün): üç hücre de kırmızı. Bozma geri alındı |
| `pnpm.cmd --filter @newfork/web exec vitest run src/documents` | 5 dosya yeşil; çekmece dosyası 31 → 46 hücre, eski hücreler değişmedi |
| `pnpm.cmd --filter @newfork/web exec vitest run` (tamamı, bir kez, bitişte; CI boşken) | 221 dosya, 1951 yeşil, 1 atlanan (eskiden beri atlanan `renderers.test.ts` hücresi) |
| `pnpm.cmd lint` | 0 hata; 20 uyarı eski, değişen iki dosyada uyarı yok (`eslint` iki dosyada çıkış 0) |
| `pnpm.cmd typecheck` | 7/7 yeşil |
| `pnpm.cmd build` | 4/4 yeşil |
| `git diff --name-only origin/main...HEAD` | yalnız `DocumentReviewDrawer.tsx`, `DocumentReviewDrawer.test.tsx` |
| `grep -cE "expect\((vi\.mocked\()?(downloadDocument\|setDocumentTimezone\|extendDocumentDeadline)"` | 4 (≥ 3) |
| Tek bağımsız inceleme (salt okunur alt ajan, plan dosyasındaki soruyla) | **OK**, kusur yok. Sorulanlar: yazılan ne zaman bırakılıyor, başka belgeye/taslağa/kişiye sızıyor mu, kayıtlı değerle karışıyor mu, Submit görünmeyen değer gönderiyor mu |

Koordinatörün üç ek şartı: (1) üç komut için ayrı hücre — var, üçü de önce kırmızı; (2) taslak değişince
taşınmıyor — iki hücre ("comes back with another draft", "moves to another document and back"); (3) kayıtlı
değer, alan değiştirilmediyse görünüyor — "shows the draft's saved values … across a command".

İnceleyenin notu, dürüstlük için: "yükleme hatasında durur" ve "kayıtlı değer görünür" hücreleri düzeltmesiz
kodda da yeşildi; hatayı yakalamazlar, yanlış bir düzeltmeyi yakalarlar (plan Done when 4 ve 6).

### Tarayıcıda gerçek akış (Koordinatör kararı A)
Yer: atık e2e dünyası **"World e2e1790771412855"** (Meyhouse'a dokunulmadı). `db.lock` boşken yazıldı; kilit
alınmadı. Web 5630, API 5631; ikisi de durduruldu, portlar boş.
- Yönetici Zeynep (sihirli bağlantı, parola yazılmadı) Settings → Documents'ta **"G18 check"** tanımını yarattı
  (Optional, son kullanma tarihi izlenir, ek alan "License number") ve yayımladı.
- Çalışan Emre, Account → Documents → "G18 check":
  - **Düzeltme öncesi kodla:** front.png yüklendi, tarih 03/01/2027 ve A-123 yazıldı
    (`1-once-yazildi.jpg`), back.png yüklendi → iki alan boşaldı (`2-once-ikinci-yuklemede-silindi.jpg`).
  - **Düzeltmeyle:** aynı alanlar yazıldı, side.png yüklendi → alanlar duruyor
    (`3-sonra-ucuncu-yuklemede-duruyor.jpg`); back.png ve side.png silindi → duruyor
    (`4-sonra-iki-dosya-silindi-duruyor.jpg`); "Submit document" → sürüm "pending review", kayıtta
    "Expires 2027-03-01" ve "License number: A-123" (`5-sonra-gonderildi-tarih-ve-numara-kayitta.jpg`).
- Erteleme ("Save reason") tarayıcıda denenmedi: o bölüm yalnız işe alım sırasında görünüyor, bu hesapta yok.
  Vitest hücresi kapsıyor.
- Dosya seçimi ve alan yazımı sayfa içi betikle sürüldü (araç dosya seçim penceresini açamıyor); istekler
  gerçek API'ye ve gerçek depoya gitti.

**Yerel DB'de bırakılan kayıtlar** (hepsi "World e2e1790771412855" içinde; ölçüm işin sonunda, yalnız SELECT):
- belge tanımı "G18 check", yayımlanmış (yerelde artık 1 tanım var; plan dosyasındaki "0 satır" ölçümü bu yüzden
  değişti — `nf-db` dilim c/d ölçerken bilsin);
- o dünyanın 9 kişisine birer belge zorunluluğu (Optional, süre sayacı yok);
- Emre Person'ın sürüm 1'i: "pending review", dosya front.png, tarih 2027-03-01, License number A-123;
- depoda 3 küçük PNG (front, back, side; back ve side taslaktan çıkarıldı, depodan silinip silinmediği
  ölçülmedi).

## 3. Açık kalan ve nedeni
- Yok (dilim a ve b için). Dilim c (sayaç) `nf-db`'de; kayıtlar (BACKLOG, KARARLAR'a U59 kuralı) kayıt oturumunda.

## 4. Ekranda ne değişti
- **Belge çekmecesi** (üç yerden açılan aynı pencere): "Expiration date" ve ek alanlar (ör. "License number")
  dosya yükleyince, taslak dosyayı silince ve erteleme nedeni kaydedince boşalmıyor; bu durumda kapatırken
  "Discard unsaved changes?" sorusu da artık çıkıyor. Görünüm, yerleşim, metin değişmedi.

## 5. Sırada ne var
1. Main'e alma (Koordinatör): rebase + kapı; iki commit birlikte ya da sırayla.
2. Dilim c (hesap menüsündeki Documents sayısı): bu denemede canlı görüldü — Emre'nin menüsünde "Documents 3",
   sayfada 1 iş vardı; gönderdikten sonra "2", sayfada 0 iş.

### Yolda bulunanlar (dokunulmadı)
- **(leave: medium / do: moderate) Çekmecenin öteki yazılan alanları hâlâ siliniyor.** Erteleme nedeni, süre
  uzatma nedeni, ret nedeni, dosya kararları ve imza adı her komutta yeniden kuruluyor. Örnek: Emre erteleme
  nedenini yazar, kaydetmeden dosya yükler → neden gider ve "Discard" sorulmaz. Plan bunu bilerek kapsam dışı
  bıraktı ("öteki alanlar temiz kurulum"); inceleyen de işaretledi. Aynı yöntemle (durumu dışarı alıp kimliğe
  bağlamak) çözülür; hangi alanların korunacağı ürün kararı.
- **(leave: low / do: safe) Submit, ekranda görünmeyen kayıtlı ek alanı da gönderiyor.** Düzeltme taslağı,
  tanımdan sonradan kaldırılmış bir ek alanın değerini taşıyorsa alan çizilmez ama değer gider. Eski davranış.
- **(leave: low / do: safe) Yayımlama penceresinde "Reason" zorunlu ama söylenmiyor.** Settings → Documents →
  "Publish": "Confirm publish" soluk kalıyor, nedenin zorunlu olduğu yazmıyor; alan en altta. `nf-arayuz`.
- **(leave: low / do: safe) e2e dünyasının owner hesabına sihirli bağlantı alınamıyor.** `/auth/v1/otp` 500
  "Database error finding user" (`confirmation_token` NULL; hesap SQL ile kurulmuş). Admin (zeynep) ve çalışan
  hesaplarında çalışıyor. Yalnız elle denemeyi etkiler; `nf-test` builder'ı.
- Belgeler için e2e senaryosu yok (plan dosyası da yazmış); bu akış ilk aday.
- Rol hafızasına (`.claude/agent-memory/nf-backend/`) yazılmadı: "yalnız iki dosya değişir" şartını bozardı.
  Yazılmaya değer tek not yukarıdaki owner / sihirli bağlantı tuzağı.
