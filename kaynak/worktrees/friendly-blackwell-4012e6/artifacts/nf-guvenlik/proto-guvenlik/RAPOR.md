# PROTO-GUVENLIK — prototip gizli veri taraması + prototip bulgularının güvenlik sınıflaması

**ÖZET:** Prototipte ve kaynaklarında anahtar, parola, canlı DB adresi ya da gerçek token yok; repoya hiçbiri girmemiş. Gerçek kişisel veri var: yayındaki prototipte 41 gerçek çalışan adı ve Mert'in kendi e-posta adresleri. Artifact'ın paylaşım durumunu araçla doğrulayamadım; Mert'in bakması gerekir. Prototip bulgularında bir gizlilik bulgusu var: herkese açık Privacy sayfası SSN sakladığımızı yazıyor. Paylaşılan cihaz bulgusunun güvenlik riski düşük. Yeni açık bulmadım.

Rol: nf-guvenlik (salt okuma), 2026-10-05 ~07:15Z. Ölçüm `origin/main` `6326f23a` üzerinde. Hiçbir dosya silinmedi ya da değiştirilmedi. Raporda e-posta adresleri maskelendi (`me***@…`).

---

## Bölüm 1 — Prototip ve kaynaklarında gizli veri / sır taraması

### 1.1 Nerede duruyor
Bitti. İki kaynağın ikisi de tarandı:
- Temp scratchpad: `…sleepy-lumiere-443370/20722961-…/scratchpad`.
- Repodaki kopya: `artifacts/prototype/`, alt klasörleri `q/`, `eslik/` ve `backlog-taslak/` dahil.

Yayındaki artifact dosyaları da okundu: `project/App.dc.html`, `index.html`, `project/canvas.json`.

### 1.2 Sırlar: yok

| Ne arandı | Kaynaklar (iki klasör) | Yayındaki `App.dc.html` |
|---|---|---|
| `apps/api/.env.local` ve `apps/web/.env.local`'daki gerçek değerler: service_role, anon, **Resend API anahtarı** | 0 dosya | 0 |
| `seed.sql` parolaları (3 adet) ve e2e dünya parolası | 0 | 0 |
| Canlı Supabase proje kimliği ve `supabase.co` adresi | 0 | 0 |
| `sb_secret_` / `sb_publishable_` / `re_…` / `sk_…` biçimli anahtar | 0 | 0 |
| JWT | 8 dosya (aşağıda) | 0 |

Ölçüm güvenilir mi diye kontrol ettim. `.env` dosyalarında `\r` yok. Aynı grep `owner@newfork.test`'i 15 dosyada buluyor.

**JWT bulunan 8 dosya** (her iki klasörde de aynı 8 dosya var):
- `p1/real_state.json`, `p3_real_state.json`, `p4_real_state.json`, `p5_main_state.json`, `p5_real_state.json`, `q2_real_state.json`, `q4_real_state.json`, `s5_real_state.json`.
- Bunlar Playwright'ın kaydettiği tarayıcı oturumları; prototip turu gerçek uygulamayı bunlarla açtı. Her biri **yerel** Supabase'in (`127.0.0.1:55321`) `owner@newfork.test` oturumu, origin `127.0.0.1:5555/5636`.
- Erişim token'larının süresi 02:00Z–05:29Z arasında dolmuş (ölçüm 07:13Z).
- Yenileme token'ları dosyada duruyor. Yerel Supabase çalıştıkça kullanılabilirler, ama yalnız bu bilgisayara erişimi olan biri için.
- **Risk düşük.** Öneri: tur bitince bu 8 dosya silinsin (karar koordinatörde / Mert'te; ben silmedim).

Oturumu üreten betik (`s5_real_login.js`) anon anahtarı çalışırken `.env.local`'dan okuyor, dosyaya yazmıyor.

**Prototip parolası:** `meyhouse-2026`, `parts/x_auth_signin.js:5` ve `proto-audit/Q1.md:9`'da duruyor.
- Yalnız prototipin sahte giriş ekranının kabul ettiği değer.
- Yayındaki `App.dc.html`'de 0, repoda 0, seed'de yok.
- Bulgu değil. Tek şart: Mert bu parolayı gerçek bir hesapta kullanıyorsa değiştirmesi gerekir.
- Diğer sahte parolalar (`newpass-2026`, `brandnew-2026`) yalnız tur betiklerinde; yayında 0.

### 1.3 Gerçek kişisel veri: var

**Yayındaki prototip (`project/App.dc.html`):**
- 41 çalışan adının 41'i var. Kaynak: `artifacts/prototype/parts/employees-data.tsv` (42 satır; sütunlar `name … invite_email`).
- Gerçek e-postalar:
  - `me***@meyhousefood.com` (6 yer, örn. satır 2748)
  - `mt***@gmail.com` (2)
  - kullanıcının kendi hesap adresi `th***@gmail.com` (2, satır 5963)
  - `22***@22.com` (1)
  - Bunlar Mert'in kendi adresleri. Başka bir kişinin gerçek adresi yayında yok.
- Doğum tarihi, acil durum kişisi ve telefon alanları yayında boş (`dob: ''`, satır 5995). Telefonlar hep `555` (uydurma).

**Yalnız yerel kaynaklarda (yayında değil):**
- `p2/real_employees.json` ve `p2/src/employees.js`: yerel DB'den alınmış 48 kişilik çalışan kaydı. Bazı kişilerde `priv` bloğu var: doğum tarihi, acil durum kişisi, telefon. Örnek: E-9006 kaydında bir gmail adresi, doğum tarihi ve 10 haneli telefon. Bu dosyalar `artifacts/prototype/p2/` ve scratchpad'de.
- Başka gmail adresleri (`ay***`, `87***`, `ne***`, `jo***`) tur betiklerinde ve eski önizlemelerde var (`acts/q1_signup.json`, `docs-table/project/App.dc.html`, `p1/preview_before.html`).
- Ekran görüntüleri: scratchpad'de 1210 `shots/`, kopyada 977. Gerçek uygulamanın ekranları; adlar büyük olasılıkla görünüyor. Görüntüyü metin olarak taramadım.

**Risk: kim görebilir?**
- Yerel dosyaları yalnız bu bilgisayara erişimi olan biri görebilir. `artifacts/` git dışı, scratchpad repo dışı.
- Yayındaki prototipi artifact'ı açabilen herkes görür.
  - Artifact listede "mine, pinned". Artifact'lar özel başlar.
  - **Paylaşım durumunu doğrulayamadım:** Artifact aracı `list` / `read` paylaşım ayarını göstermiyor.
  - Asset deposu boş (0 dosya). Yayın 17 dosya; tasarım tipinin kendi dosyaları dışında yalnız `index.html`, `project/App.dc.html`, `project/canvas.json`.

**Önerilen giderme (hiçbirini yapmadım):**
1. Mert, claude.ai'da artifact'ın paylaşım menüsünden "özel" olduğunu bir kez görsün (araçla ölçülemiyor).
2. Prototip paylaşılacaksa önce `parts/employees-data.tsv`'deki adlar uydurma adlarla, `invite_email` sütunu `@example.test` adresleriyle değiştirilip yeniden yayınlansın. Bu bir veri değişikliği, prototip oturumunun işi.
3. Tur bitince yerel oturum dosyaları (8 adet `*_state.json`) ve `p2/real_employees.json` silinsin. Silme kullanıcı onayı ister.

### 1.4 Git: hiçbiri repoya girmemiş
- `git log --all --oneline -- '*gen_app*' 'artifacts/*' '*employees-data*' '*App.dc.html' '*real_state*'` → 0 commit.
- `git check-ignore -v artifacts/prototype/parts/employees-data.tsv` → `.gitignore:17:artifacts/`.
- Repo GitHub'da `PRIVATE` (`gh repo view`).
- Yan not (prototiple ilgisi yok, eskiden beri duruyor): Mert'in kendi adresleri iki izlenen dosyada var: `scripts/export-local-fixture.mjs:12,56-59` ve `docs/plan/research/foundation-2026-09-23/olcumler.json` (2 yer). Repo özel; risk düşük; iş açmayı önermiyorum.

### 1.5 Dışarıya e-posta çıktı mı: hayır
Yerel API'nin `.env.local`'ında **gerçek bir Resend anahtarı** var. Bu anahtarla yerel API'nin gönderdiği davet ya da parola e-postası gerçek adrese gider.

Gerçek uygulama turlarının betiklerini okudum:
- `q2_real.js`, `q3_real.js`, `q4_real.js`, `p5_real.js`: GET dışındaki her isteği engelliyor ya da yerelde cevaplıyor (`q3_real.js:21`, `q4_real.js:89`, `p5_real.js:20`).
- `q1_real.js`: yalnız ekran görüntüsü alıyor; form göndermiyor (`:1`, `:32`).

Turlardan e-posta çıkmamış. Bilgi olarak yazıyorum: o anahtarın yerel ortamda bulunması bilinçli bir seçim olabilir. Ama bir sonraki tur yazma isteğini engellemezse gerçek kişilere davet gidebilir.

---

## Bölüm 2 — Prototip bulgularının güvenlik / gizlilik sınıflaması

Kaynaklar:
- `backlog-taslak/Q-bulgular-eslik-tumu.md` (46 bulgu)
- `backlog-taslak/Q3-Q5-bulgular.md` (30 bulgu)
- `docs/plan/BACKLOG.md` BL-606–BL-619

Her aday için kodu `origin/main`'de okudum.

### 2.1 Güvenlik ya da gizlilikle ilgili olanlar

| # | Bulgu | Gerçek risk | Önerilen işaret | Sınıf | Ultrareview |
|---|---|---|---|---|---|
| G1 | Privacy "encrypted SSN field" diyor (BL-382'ye kanıt) | **Gerçek, gizlilik/yasal** | leave medium / do safe | metin R0; BL-382'nin DB kısmı R3 | metin: hayır; DB kısmı: evet |
| G2 | Paylaşılan cihazda sonraki kişi öncekinin son sayfasına iniyor | Düşük | leave low / do safe | R1 | hayır |
| G3 | Ham veritabanı hatası ekranda ("duplicate key value violates unique constraint …") | Düşük (bilgi sızıntısı) | leave low / do moderate | R2 | hayır |
| G4 | Davet sayfası yüklenirken "this workspace" diyen açık Accept düğmesi | Düşük (rıza) | leave low / do safe | R1 | kural gereği önerilir, değeri düşük |
| G5 | Giriş ekranında Supabase'in ham metinleri (ve sadeleştirirken hesap varlığı) | Bugün yok; düzeltmede tuzak | — (mevcut madde) | — | — |

**G1 — Privacy sayfası SSN topladığımızı söylüyor.**
- Kod: `apps/web/src/public/PublicTrustPages.tsx:97-99` "…and an encrypted SSN field when the onboarding flow requires it."
- Sayfa `/privacy`; oturum gerekmez, herkes okur.
- Ürün SSN toplamıyor (ROADMAP kapsam dışı; KARARLAR "SSN toplanmaz"). API ucu 410 dönüyor (BL-382).
- Risk: yayınlanmış gizlilik beyanı gerçeği yanlış söylüyor. Burada fazla söylüyor, eksik değil; yani kişiye zararı az. Ama yasal metinde yanlış beyan, lansmandan önce düzelmesi gereken türden. Örnek: Meyhouse'u kuran bir owner Privacy'yi okur, çalışanlarından SSN isteneceğini sanar ve çalışanlarına öyle söyler.
- Aynı sayfanın geri kalanı:
  - `:90` "theme preference" doğru: hesapta tema alanı var (`AuthContext.tsx:317`).
  - `:345` "selected theme" de doğru.
  - Accessibility'deki "Light and dark themes" (`:233`) gizlilik değil, yanlış erişilebilirlik beyanı (leave low).
- Öneri: SSN cümlesi BL-382 temizliğini beklemeden metinden çıksın (R0, tek satır). BL-382'nin veritabanı kısmı (`employee_sensitive_…` tablosunu ve 410 ucunu silmek) veri silme olduğu için R3: `nf-guvenlik` zorunlu, ultrareview önerilir.

**G2 — Paylaşılan cihazda yeni giren kişi bir öncekinin son sayfasına iniyor** (`ProtectedRoute.tsx:25-32`, `SignInPage.tsx:22-24`).
- Ne taşınıyor: yalnız adres (yol + sorgu), tarayıcının geçmiş durumunda (`location.state`). URL'de değil.
- Açık yönlendirme yok: `safeSignInDestination` (`SignInPage.tsx:195-205`) yalnız aynı kökenli yolu kabul ediyor.
- Veri sızıyor mu? Hayır:
  - Önbellek her çıkışta ve her girişte temizleniyor (`AuthContext.tsx:102-107`, `:261`, `:304`; yorum bunu zaten paylaşılan tablet için yazmış).
  - İnilen sayfanın yetkisi sunucuda yeniden soruluyor.
- Ali en fazla Ayşe'nin hangi sayfada olduğunu öğrenir. Sorgu dizesinde bir kimlik varsa opak bir UUID görür. Yetkisi yoksa "erişim yok" ekranını görür.
- Taslaktaki "leave medium" kullanıcı deneyimi için makul. Güvenlik açısından **low**.
- Düzeltme: açık çıkışta `/sign-in`'e `from` taşımamak. R1.

**G3 — Ham veritabanı ve zod metinleri ekranda** (C1, C2; `organization-data.ts:53-59`, `errorText` 58 çağrı).
- Ekrana çıkan: Postgres'in mesajı (kısıt adı, ör. `…_name_key`). `detail` alanı (çakışan değer) mesajda yok.
- Bunu yalnız aynı workspace'te yazma yetkisi olan kişi (owner/admin) görüyor. Başka workspace'in bilgisi gelmiyor.
- Risk: şema adlarının sızması. Düşük.
- Düzeltme 58 yere dokunduğu ve shared şema mesajlarını değiştirdiği için R2. Tek bağımsız inceleme yeter.
- Düzeltirken dikkat: yeni sade cümle kimin kaydıyla çakıştığını söylememeli (ör. "Ayşe'nin e-postası zaten kayıtlı" gibi başka kişiyi açığa çıkaran metin olmamalı).

**G4 — Davet sayfası yüklenirken açık Accept** (`AcceptInvitationPage.tsx:52-53`, `:172`).
- Sunucu kabulde e-posta eşleşmesini, onaysız e-postayı, süreyi ve bulunamayan daveti ayrı ayrı reddediyor (`:160-166` bu kodları okuyor).
- Yanlış kişi ya da süresi geçmiş davet kabul edilemez.
- Risk yalnız rıza: kişi hangi workspace'e katıldığını görmeden basabilir; katıldığı yer yine kendisine gönderilmiş davettir.
- R1 (yalnız web'de yükleniyor dalı). CLAUDE.md §5 "katılım/davet"i riskli yüzey sayıyor, bu yüzden kural gereği ultrareview önerilmeli. Bu değişiklik sunucuya ve sözleşmeye dokunmadığı için ben gerekli görmüyorum.

**G5 — Giriş ekranında ham Supabase metinleri** (`AuthContext.tsx:265`, `:289`).
- Bugün hesap varlığını sızdırmıyor. Gerekçe (kodda ölçmedim; Supabase'in bilinen davranışı): "Email not confirmed" ancak parola doğruysa çıkar. Canlıda "Confirm email" açık olduğu için (BL-336, 2026-09-28) kayıtta var olan hesaba hata değil sahte başarı döner.
- Tuzak, metin sadeleştirilirken çıkar: "User already registered" ya da "Email not confirmed" "bu adresle hesap var" diye çevrilmemeli.
- Aynı şekilde "Email not confirmed" ekranına eklenecek "yeniden gönder" düğmesi (karar bekleyen kısım) oturumsuz bir e-posta ucu olur. Parola sıfırlamadaki gibi sabit cevap, sabit süre ve hesap başı sayaç ister. Parola sıfırlama bunu doğru yapıyor (`apps/api/src/account/password-reset.ts:8-9`, `:63-87`).
- Öneri: bu iki şart ilgili maddeye "güvenlik şartı" olarak yazılsın. Sınıf: metin R1; yeniden gönderme ucu eklenirse R3.

### 2.2 Güvenlik değil (okudum, sınıfladım)

**Workspaces'te "Create your workspace" çalışana da görünüyor** (`WorkspaceHubPage.tsx:324`).
- Sunucu reddediyor; düğme kuralı atlatmıyor.
- Çıkmaz düğme, kullanıcı deneyimi.

**Girişte bekleyen davet ekranı yok; varsayılan workspace tahmini** (`resolveLanding.ts:112-125`, `:136-158`).
- Kişi yanlış workspace'e inebilir, ama orada yalnız kendi yetkisi kadar görür.
- Kiracılar arası sızıntı yok. Veri bütünlüğü riski (yanlış işletmede iş yapmak) leave medium olarak doğru.
- Giriş yönünü değiştirdiği ve katılıma dokunduğu için R2. Giriş e2e'si etkilenir.

**Management'ta Remove → Manager işi arşivleniyor** (BL-481 kanıtı).
- Owner'ın kendi verisinde yarım değişiklik; arşiv geri alınabilir.
- Veri bütünlüğü; leave medium önerisine katılıyorum.
- Tetikleyici Owner işini koruyor, yani koruma çalışıyor.

**Kurtarma bağlantısı eksik ya da süresi geçmiş; "Valid recovery token required".**
- Yalnız metin ve yol.
- Kurtarma ucunun sızıntısı BL-279'da kapandı.

**BL-606–BL-619:** hepsi Schedule ekranının davranışı ve görünümü. Güvenlik ya da gizlilik yok. BL-614 ve BL-619 sayım / etiket doğruluğu, yetki değil.

**Diğer taslak maddeler** (CSS, metin, onboarding ilerlemesi, saat dilimi, kaydırma): güvenlik değil.

### 2.3 Gözden kaçmış yeni açık
Yeni bir açık bulmadım. Yakınında bilinen bir açık madde var: **BL-351** (davet ve kurtarma bağlantısı token'ı adres çubuğunda). Bugün de geçerli: `apps/api/src/employees/invitation-service.ts:224` `/invite/accept?token=`. Web tarafı bu token'ı yalnız istek gövdesinde gönderiyor (`employee-data.ts:585-589`). Davet prototipten canlıya taşınırken bu madde de ele alınabilir; prototip bunu değiştirmiyor.

---

## Açık kalan ve nedeni
- Artifact'ın paylaşım durumu doğrulanamadı: araç göstermiyor. Mert'in bakması gerekir.
- Ekran görüntüleri (toplam ~2200 PNG) metin olarak taranmadı.
- G5'teki Supabase davranışı kodda ölçülmedi, bilgiye dayanıyor.
- Hiçbir şey silinmedi; silme önerileri kullanıcı onayı ister.
- Listede ikinci bir artifact var: "Newfork", 2026-10-04. İçeriğine bakmadım; kapsam dışı.

## Ekranda ne değişti
Hiçbir şey; salt okuma.

## Sırada ne var
1. Mert artifact'ın özel olduğunu paylaşım menüsünden görsün. Paylaşılacaksa önce adlar ve adresler uydurma veriyle değiştirilsin (1.3).
2. Privacy'deki SSN cümlesi metinden çıksın (G1, R0, tek satır); BL-382 DB kısmı ayrı R3 iş.
3. Tur bitince 8 oturum dosyası ve `p2/real_employees.json` silinsin (onayla).
4. Giriş metinleri ve "yeniden gönder" maddesine G5'teki iki güvenlik şartı yazılsın.
5. Bir sonraki gerçek uygulama turu da yazma isteklerini engellemeli: yerel API'de gerçek Resend anahtarı var (1.5).

## Kanıt (2026-10-05, bu oturumda, salt okuma)
| Komut | Sonuç |
|---|---|
| `.env.local` değerleri + seed/e2e parolaları + canlı proje kimliği, iki klasörde `grep -rlF` | hepsi 0 dosya (kontrol dizesi 15 dosyada bulundu) |
| JWT deseni + çözme (`iss`, `email`, `exp`) | 8 `*_state.json`, hepsi `127.0.0.1:55321`, `owner@newfork.test`, süresi dolmuş |
| Artifact `list files` / `read` / `list assets` | 17 dosya, asset 0; `App.dc.html`'de sır 0, TSV adları 41/41, gerçek adresler 4 tür (Mert'in) |
| `git log --all` + `git check-ignore` + `gh repo view` | 0 commit; `.gitignore:17`; repo PRIVATE |
| Tur betikleri: `route`/`abort`/form gönderimi | yazma engelli ya da gönderim yok |
| Kod okuma (`origin/main` `6326f23a`): `ProtectedRoute.tsx`, `SignInPage.tsx`, `AuthContext.tsx`, `AcceptInvitationPage.tsx`, `PublicTrustPages.tsx`, `password-reset.ts`, `employee-data.ts`, `invitation-service.ts` | 2.1'deki satırlar |
