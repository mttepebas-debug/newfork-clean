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
