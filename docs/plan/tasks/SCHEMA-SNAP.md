# SCHEMA-SNAP Şemanın bugünkü hâli tek dosyada (okuma kopyası)
Status: in progress
Session: Mert'in tekil oturumu (c69a6dcd…)   Branch: task/schema-snap   Worktree: newfork-wt/schema-snap   DB: geçici proje `newfork-schema-snap` (595xx), ortak DB'ye dokunmaz

Kaynak: Mert'in tekil oturumu, 2026-10-07. Mert sordu: "migration'ları tek dosyada toplamak ne
kazandırır?" Cevap: kazancın çoğu (okunabilirlik, silinmiş ya da değiştirilmiş eski tanıma
takılmamak) gerçek toplama yapılmadan alınabilir. Gerçek toplama canlı veritabanının kayıt
geçmişine ve açık dallara dokunuyor, o yüzden lansmandan hemen önceye kalır (FOUNDATION-B "Aşama 7 —
Tek migration tabanı", hâlâ açık). Mert'in kararları: "1. iş olarak aç", sonra "planı tekrar incele
validate et ve basla".

Tazelik 2026-10-07 (`3a32b8ca`): geçerli. `supabase/migrations` altında 437 dosya (~125 bin satır),
66'sında `drop function/table/policy` var. Repoda şema dökümü yok. Migration dosyasını adıyla okuyan
tek kod dosyası `packages/shared/src/notification-catalog.test.ts`. Özel şema yalnız `app_private`.

Goal: Oturumlar bir fonksiyonun, politikanın ya da tablonun bugünkü tanımını 437 dosyada son tanımı
arayarak değil, tek bir okuma dosyasından bulsun. Böylece silinmiş ya da değiştirilmiş eski tanım
"bugün böyle" diye okunmaz.

In scope:
- `supabase/schema.sql`: `public` + `app_private` şemalarının, migration'lar boş bir veritabanına
  uygulandıktan sonraki dökümü. Yalnız okumak için; hiçbir araç bunu uygulamaz. Başında üretim
  komutu, migration sayısı, son migration ve parmak izi (migration'ların sha256'sı) yazar.
- `pnpm.cmd db:schema` (`scripts/schema-snapshot.mjs write`): `supabase/` klasörünü geçici bir
  klasöre kopyalar, projeyi `newfork-schema-snap` adına ve 595xx portlarına taşır (CI'daki
  `ci-supabase-apart.sh` fikri), ikisi de tutmadıysa hiçbir şey başlatmaz ya da durdurmaz; boş
  veritabanını kurar, döker, kapatır ve siler.
- Veritabanısız hızlı kontrol (`check-fast`, milisaniye): parmak izi migration'larla uyuşmuyorsa
  uyarır. `pnpm lint`'in ilk adımı; böylece yeni kuralı bilmeyen oturum push etmeden önce görür.
- CI `db` işinde tam kontrol (`check`): `supabase start`'tan sonra, pgTAP'ten önce CI'ın taze
  veritabanını döker ve repodaki dosyayla karşılaştırır; farkta ilk farklı satırı yazar.
- README'de bir paragraf.

Out of scope:
- Migration'ları gerçekten toplamak, arşivlemek, silmek (FOUNDATION-B Aşama 7, lansman öncesi).
- Canlı veritabanı.
- `storage` / `auth` / `cron` / `realtime` tarafı (33 migration bunlara dokunuyor; gerekirse ayrı
  madde). Seed ve test dünyası `public` / `app_private`'a nesne eklemiyor (ölçüldü).
- Bir bot'un main'e otomatik commit atması.
- `CLAUDE.md` ve rol dosyalarına satır: Mert'in onayına bağlı, aşağıda öneri.

Doğrulamada plana gelen değişiklikler (2026-10-07):
1. Kontrol önce UYARI modunda gelir (ILKELER P16: "yeni lint, hook ya da denetim önce uyarı
   modunda gelir"). Betikteki `STRICT = false` tek satırla `true` olunca hem `pnpm lint` hem CI
   `db` işi bayat dosyada kırmızı olur. Geçişi koordinatör, bütün oturumlar kuralı bildiğinde yapar.
2. Veritabanısız hızlı kontrol eklendi (yukarıda). Neden: CI kontrolü yalnız push'tan sonra konuşur;
   sıkı modda yeni kuralı bilmeyen bir oturum main'i kırmızıya çevirebilirdi.
3. "Unutma kontrolü kırmızı olur" kanıtı CI'da bilerek kırmızı bir koşuyla değil yerelde verilir:
   tek CI koşucusu var, her koşu ~20 dk (KK-176).
4. Satır sonu: bir migration (`20260909003001_…`) fonksiyon gövdesinde bilerek CR baytı tutuyor ve
   `.gitattributes` `supabase/**/*.sql` dosyalarını commit'te LF'ye çeviriyor. Döküm ve parmak izi
   her CR'yi siler; yoksa Windows'ta üretilen dosya CI'da hep "bayat" görünürdü.

Done when:
1. `supabase/schema.sql` main'de; CI `db` işinin "Schema snapshot matches the migrations" adımı
   "matches" yazıyor (Windows'ta üretilen dosya = Linux CI'ın taze dökümü).
2. İki ayrı boş veritabanından üretilen iki döküm birebir aynı.
3. Uyarı yolu yerelde gösterildi: dosya bayatken `check-fast` uyarı verir, `check` ilk farklı satırı
   yazar; `STRICT = true` iken ikisi de çıkış kodu 1 verir.
4. Yeni migration yazan oturumun ek adımı tek komut (`pnpm.cmd db:schema`, ~1 dk); README'de yazılı.
5. CI `db` işi en fazla ~1 dk uzar.

Touches: `scripts/schema-snapshot.mjs`, `scripts/schema-snapshot.test.mjs` (yeni), `package.json`
(`db:schema`, `lint`, `test`), `.github/workflows/ci.yml` (`db` işi: setup-node + kontrol adımı),
`README.md`, `supabase/schema.sql` (yeni, üretilmiş), bu dosya.

Test plan: `node --test scripts/schema-snapshot.test.mjs` (geçici projenin ortak yığından ayrılması,
parmak izi, CR temizliği). Done when 1-3 doğrudan kanıt. Yerel `test:db` koşulmaz: hiçbir migration
ya da pgTAP dosyası değişmiyor, `schema.sql` hiçbir yerde uygulanmıyor; dal CI'ı pgTAP'i zaten koşar.

Risk: R2 (ortak CI işine adım ekliyor; yetki, veri ve canlı yok). Tek bağımsız inceleme. Görsel QA
yok (ekran değişmiyor). En büyük risk ortak yerel yığını durdurmak: `write` yalnız proje adı ve
portlar değiştiyse başlatır ve durdurur (test bunu kilitliyor).
Reviewer: `nf-guvenlik` (R2, tek göz).

## Notes / Result
