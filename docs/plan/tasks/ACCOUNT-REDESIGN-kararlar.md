# ACCOUNT-REDESIGN — kullanıcı yokken verilen kararlar

Kullanıcı 2026-09-29'da "karar vermen gereken yerde vizyonuma, planımıza göre
karar ver ve her birini ayrı bir md'ye logla; yanlışsa sonra düzeltirim" dedi.
Bu dosya o kararlardır. Her madde: ne karar verildi, neye dayanarak, geri
almak ne kadar kolay. Kullanıcının kendi verdiği kararlar burada değil,
`docs/plan/KARARLAR.md`'de ya da koordinatör raporunda. İşi devralan oturum
yeni kararlarını bu dosyanın sonuna aynı biçimde ekler.

Branch `task/account-redesign`, worktree `../newfork-wt/account-redesign`.

## Profile (kullanıcı varken, ama ayrıntıyı benim seçtiğim)

- **K-P1. Preferred name'in ekrandaki ilk değeri:** workspace kayıtlarından
  dolu olan ilk `preferredName`; hiçbiri yoksa hesabın adı (`displayName`).
  Dayanak: kullanıcı "preferred name onaylı isim, hesap adı da güncellenir"
  dedi; ekranda iki farklı isim göstermemek için tek kaynak seçildi.
  Geri alma: kolay (`ProfilePage.tsx` `preferredOnFile`).
- **K-P2. Acil durum kişisi birden fazla workspace'te farklıysa:** dolu olan
  ilk kayıt gösterilir, kaydedince hepsine aynısı yazılır. Dayanak: kullanıcı
  "tek form, hepsine yazılır" dedi; farklı kayıtlardan hangisinin öne
  çıkacağını söylemedi. Geri alma: kolay (`leadingContact`).
- **K-P3. Kısmi kayıt:** tek Save sırayla hesap → legal name → preferred name
  isteği → acil durum kişisi yazar; biri hata verirse diğerleri yine yazılır,
  hatalar tek satırda birleşir. Dayanak: tek transaction yok (dört ayrı uç);
  durup geri almak da mümkün değil. Geri alma: orta.

## Diğer sekmeler (2026-09-29, kullanıcı uyurken)

- **K-1. Preferences ve Notifications birleşmez, iki sekme kalır.** Dayanak:
  KARARLAR.md "Bildirimler: bildirim sistemi ayrı bir projede baştan
  tasarlanacak" ve Settings → Notifications "o zamana kadar olduğu gibi
  kalır". Birleştirme o projenin işini önden yapmak olurdu. Notifications
  yalnız görünüm olarak sadeleşir, davranışı aynı. Geri alma: kolay.
- **K-2. Account'ta kaydet düğmesi her yerde "Save", Discard yalnız değişiklik
  varken görünür, Save yalnız değişiklik varken açılır.** Dayanak: Profile'da
  kullanıcının kurduğu kural; aynı işlevdeki bileşen aynı görünür
  (CLAUDE.md §9 görsel tutarlılık). Geri alma: kolay.
- **K-3. Security'de tek Save yok; her bölüm kendi düğmesini tutar.**
  Dayanak: e-posta, parola, oturumlar ve silme ayrı işlemler ve üçü parola
  doğrulaması ister; tek düğme bunları karıştırır. Geri alma: —.
- **K-4. Security → "Active sessions"taki "This device · Current" satırı
  kalkar.** Dayanak: satır her zaman yalnız bu cihazı gösteriyor, bilgi
  taşımıyor (kullanıcının "bilgi taşımayan öğe" ilkesi). Düğme ve parola alanı
  aynen. Geri alma: kolay.
- **K-5. Security → "Delete account" pembe zeminli bloktan düz bölüme iner;
  düğme dinlenirken yumuşak kırmızı.** Dayanak: "yıkıcı eylem net ama sayfaya
  hâkim olmasın" (ilk istek); düğme parola penceresi açtığı için iki tık
  (UI-12) değil, pencere (UI-13 notu) kalır. "Cancel change" kırmızı ve adı
  aynen (KARARLAR Account). Geri alma: kolay.
- **K-6. Documents (Account) kişisel görünümde EMPLOYEE sütunu, lokasyon
  filtresi ve çalışan araması gösterilmez.** Dayanak: liste yalnız kişinin
  kendisini gösteriyor (`selfOnly`); bu üçü tek satırlık veride anlamsız.
  Ortak bileşen `EmployeeDocumentsList`'e yalnız Account'un verdiği bir
  seçenek eklenir; yöneticinin Documents ekranı değişmez. Geri alma: kolay.
- **K-7. Documents'ta "Nothing waiting" rozeti yalnız bekleyen varken
  ("2 waiting on you").** Dayanak: sessiz durumda rozet bilgi taşımıyor.
  Geri alma: kolay.
- **K-8. Workspaces: satır düzeni ve eylemler aynen (çalışılan satır tonlu,
  "Current" rozeti yok, her satırda yeşil Open).** Dayanak: KARARLAR Account
  ve 2026-09-17 buton kararı. Değişen yalnız çevre: gri panel kalkar, ince
  çizgili liste. Geri alma: kolay.

## Devralan oturumun kararları (2026-09-29, kullanıcı uyurken)

- **K-9. Security'de e-posta tek satır, parola alanları tek sıra.** Kayıtlı
  e-posta "adres · Verified" diye tek satırda; posta ikonu ve "Primary email"
  etiketi kalktı (tek e-posta var, bilgi taşımıyor). Current / New / Confirm
  password Profile'ın üç kolonlu ızgarasında yan yana, "Change password"
  sağda normal boy. "Change password" ve "Sign out other sessions"
  düğmelerindeki ikonlar kalktı ("Change email" ve "Save" gibi düz metin);
  "Delete account" çöp kutusu ikonunu tutar (Profile'daki "Remove" gibi).
  Hesap başka workspace'lerde kullanılırken çıkan açıklama kırmızı uyarı
  kutusundan gri bilgi kutusuna indi: hata değil, düğmenin neden kapalı
  olduğunu anlatıyor. Geri alma: kolay (`SecurityPage.tsx`, `account.css`).
- **K-10. Notifications görünümü.** Başlık menüyle aynı: "Notifications";
  açıklama "Choose which updates reach you, workspace by workspace."
  Kutucuklar uygulamanın yeşili (`--theme-accent-strong`), tarayıcı mavisi
  değil. Tekil bildirimler kategorinin altında bir adım içeride ve
  kategoriden küçük yazıyla (önce tersiydi: alt satır 15px, kategori 13px).
  Workspace seçici 320px. Davranış aynı. Geri alma: kolay
  (`notification-preferences.css`).
- **K-11. Documents'ta hiçbir şey istenmemiş workspace tek satır.** Kişiden o
  workspace'te hiçbir belge istenmediyse durum sekmeleri, tür filtresi ve boş
  tablo yerine "Nothing has been asked of you here." yazar. En az bir istek
  varsa tablo gelir; "Document type" filtresi kalır (K-6 yalnız üç öğeyi
  kaldırdı), lokasyon adı belge adının altına taşındı (çalışan sütunu
  kalktığı için). Dayanak: "bilgi taşımayan öğe kaldırılır" ilkesi. Geri
  alma: kolay (`EmployeeDocumentsList.tsx` `nothingAsked`; yalnız
  `personal` verildiğinde).
- **K-12. Preferences seçicileri Profile'ın üç kolonlu ızgarasında.** Date ve
  time format iki geniş kutu yerine Profile'daki alanlarla aynı genişlikte;
  kayıtlı değer yeniden seçilirse Save yine kapanır ve Discard kaybolur.
  Geri alma: kolay.
- **K-13. Workspaces'te açık olan satırın tonu sütundan 12px taşar, köşeleri
  yuvarlak; yanındaki ince çizgiler gizlenir.** Dayanak: gri panel kalkınca
  ton kenara yapışıyordu; taşan ton satır yazısını başlıkla aynı hizada
  tutar. Geri alma: kolay (`account.css` `.pb-row[aria-current]`).
- **K-14. Bağımsız yargıcın (ekran görüntüsüyle puanlama) bulguları.**
  Puanlar (masaüstü / telefon): Security 8/7, Preferences 7/7,
  Notifications 6/5, Workspaces 8/6, Documents 7/8. **Alınan:** telefonda
  Notifications kutucukları 20px ve hücre 44px yüksek; Workspaces'te Open /
  Continue ve "⋯" 44px. **Alınmayan ve nedeni:** e-posta sütununun neden
  kapalı olduğunu yazan satır (BL-055'te, `a12b2e0c`, bilerek kaldırılmış);
  açık workspace'e "Current" yazısı (K-8, KARARLAR Account); telefondaki üst
  şerit ve sekme şeridi (çerçeve, kullanıcı onayladı); "System" seçeneğine
  örnek biçim (sistem biçimini çözen yardımcı yok, yeni mantık olurdu →
  backlog adayı); silme engeli metnine Workspaces bağlantısı (menü hemen
  yanda, fonksiyonun testli metni değişirdi); Documents'taki "Documents"
  sekmesinin adı (ürün metni, bu işin kapsamı değil); pasif düğme kontrastı
  (ortak Button, tüm uygulama; WCAG pasif kontrolü saymaz → backlog adayı);
  Workspaces telefonda alt alta dizilen satır (ortak satır kiti, K-8).

## Düzeltme turu (2026-09-29, `merge/account` üzerinde; nf-guvenlik ve nf-gorsel-qa bulguları)

- **K-15. Profile'da Save neden kapalı: tek satır, eksikler adıyla.** Save'in
  hemen üstünde "To save, fill in phone number and relationship." gibi tek
  satır; Save `aria-describedby` ile ona bağlı. Zorunlu alanlar görsel
  yıldızla işaretlenmedi: azınlık olan isteğe bağlılar zaten "optional"
  yazıyor (Middle name, Preferred name), zorunlu kutular `required` taşıyor
  (ekran okuyucu söyler); altı alana yıldız gürültü olurdu. Satır, hiçbir şey
  değişmemişken de eksik varsa görünür (yeni hesap neyin gerektiğini baştan
  görür). Geri alma: kolay (`ProfilePage.tsx` `missing`).
- **K-16. Profile'da kısmi kayıt her workspace için ayrı izlenir** (nf-guvenlik
  bulgusu). Acil durum kişisi ve preferred name her kayıtla tek tek
  karşılaştırılır; yalnız farklı olanlara gönderilir; düşen workspace
  mesajda adıyla geçer ("…could not be saved in Ridgeline. Try again."),
  Save açık kalır ve yeniden deneme yalnız düşeni gönderir. Yöneticinin
  onayını bekleyen preferred name isteği kayıtta görünmediği için "gönderildi"
  bilgisi oturumda tutulur. Yan etki: kayıtlar baştan farklı kişiler
  tutuyorsa (K-P2) kullanıcı değiştirip geri alsa da Save açık kalır; kaydetmek
  hepsini eşitler. Geri alma: orta.
- **K-17. Account'ta düğme boyu: form, satır içi ve başlık düğmeleri alan
  boyunda.** Save, Discard, Change email, Change password, Sign out other
  sessions, Delete account, Create workspace: 40px (telefonda 44px), yanındaki
  alanla aynı. Profile'daki fotoğraf düğmeleri (Upload, Remove) avatarın
  yanında kompakt kalır (kullanıcı onaylı), Workspaces satır düğmeleri satır
  kitini izler (telefonda 44px). Geri alma: kolay (`account.css`).
- **K-18. Documents telefonda yana kaydırmasız.** Kişisel tablonun en küçük
  genişliği (780px) kalktı, belge adı üç noktayla kesilmek yerine alt satıra
  kayar; "Document type" seçicisi diğer Account alanlarıyla aynı boy ve
  kenarda. Yalnız `personal` tablo; yöneticinin ekranı aynı. Geri alma: kolay.
- **K-19. Workspaces'te açık satırın "Owner" satırı `--theme-text-secondary`.**
  Ton zemininde `--theme-muted` 4,39:1 idi; yeni renk 5,76:1 (hesaplandı).
- **K-20. Bölüm açıklamaları 13px.** Legal name altındaki açıklama 12px'ti,
  diğer bölüm açıklamalarıyla eşitlendi. Alan altı yardım yazıları (input
  altındaki `small`) 12px kalır: ayrı rol.
- **K-21. Notifications telefonda açma okları 44×44px.**
- Kapsam dışı bırakılan (koordinatörün notu): Documents menü sayacı ile boş
  sayfa çelişkisi (backlog), Schedule Settings telefonda taşma (BL-333).
