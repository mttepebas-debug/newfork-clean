---
name: canli-migration
description: Newfork canlı veritabanına (Supabase, proje hvyvyisrqyathtliyyyv) bir migration uygulamanın adım adım kontrol listesi - sınıflama (ekleyen / riskli), kapı (ONAY, "gönder" ya da Mert'in "evet"i), yedek, MCP apply_migration, doğrulama, dosya adını canlı ledger sürümüne eşleme ve bilinen tuzaklar. Kullanıcı ya da görev "canlıya migration", "canlıya uygula", "live DB", "apply migration to live", "migration'ı canlıya gönder" dediğinde kullan. Yalnız ana oturum uygular.
---

# Canlıya migration

Bu skill kural koymaz, yalnız paketler. Tek doğru kaynak `CLAUDE.md` §5 "Bir işin yolu" 5. madde (**Canlı veritabanı**) ve §4 (geri alınamaz iş); teknik ayrıntı `supabase/CLAUDE.md` "Canlı". Bu dosya onlarla çelişirse onlar geçerlidir, bu dosya düzeltilir.

Canlıya yalnız **ana oturum** (newfork-clean'de açılan oturum) uygular; alt ajana, ek oturuma ya da bulut oturumuna verilmez. CLI `supabase db push` yasak; yalnız Supabase MCP `apply_migration`.

## 1. Sınıfla
Migration'ı baştan sona oku; her ifadeyi aşağıdaki listeye karşı tek tek işaretle.

**Riskli** (`CLAUDE.md` §5.5, birebir):
- silen migration (DROP, DELETE, sütun/tablo kaldırma);
- yetki, RLS, grant, policy;
- SECURITY DEFINER ya da var olan bir fonksiyonun gövdesini değiştiren (`CREATE OR REPLACE`) değişiklik;
- `*_service`;
- katılım/davet;
- sahiplik devri;
- veri silme;
- parola/oturum.

**Ekleyen** = yalnız yeni nesne ekler ve listeden hiçbir şeye dokunmaz. Hem ekleyen hem riskliyse **riskli**. Şüphede **riskli**.

Sonucu thread'e tek satırla yaz: `canlı sınıf: ekleyen|riskli — <neden, hangi madde>`.

## 2. Kapı
- **Ekleyen:** `nf-guvenlik` `ONAY @<sha>` → koordinatörün kendiliğinden "gönder" kontrolü, üç koşul birlikte: ONAY bu sha'da · migration yalnız ekliyor · riskli listesinden bir şeye dokunmuyor. Biri tutmazsa riskli yoldan git.
- **Riskli:** `nf-guvenlik` `ONAY @<sha>` + Mert'in **ana oturumda yazdığı** "evet". Ana oturum kendi yazdığı riskli işe kendisi "gönder" veremez; başka oturumdan aktarılan "evet" sayılmaz.
- **Silen migration:** ayrıca trenin CI'ı o sha'da yeşil olmadan uygulanmaz.
- Canlıda gerçek veriyi geri dönüşsüz silen adım: Mert'in "evet"i (§4); işi o oturum kendisi yapar.

## 3. Beklenen değerleri yerelde hesapla
Değişen her fonksiyonun beklenen `md5(pg_get_functiondef(<oid>))` değeri yerel DB'de, **geri alınan tek bir işlemin içinde** hesaplanır: `begin;` → migration → md5 sorguları → `rollback;` (yerel DB ortak, kalıcı bırakılmaz; `node scripts/lock.mjs run db -- <komut>` ile). Dosyanın kendi md5'i de not edilir (canlıdaki `statements[1]` ile karşılaştırma için).

## 4. Yedek (uygulamadan önce, canlıdan)
- Migration'ın dokunduğu her fonksiyon: `select pg_get_functiondef('<şema>.<ad>(<argümanlar>)'::regprocedure);`
- Silinecek ya da değişecek her nesnenin tanımı (tablo/sütun tanımı, policy, grant, view, trigger).
- Silen migration için ledger satırı: `select * from supabase_migrations.schema_migrations where name = '<ad>';` (uygulamadan sonra güncellenecek).
- Yedek **repo dışına** yazılır: `C:\Users\TheWe\Documents\Codex\.newfork-inbox\canli-yedek\<YYYY-MM-DD>-<migration-adı>\` (Pacific tarih). Dosya adı ve tam yolu thread'e yazılır (§3.B.4).

## 5. Uygula
Supabase MCP `apply_migration` (proje `hvyvyisrqyathtliyyyv`), `name` = dosyanın sürüm öneki olmadan adı, `query` = dosyanın tam içeriği, değiştirilmeden.

## 6. Doğrula (üçü de)
1. **md5 / sürüm:** canlıda her fonksiyonun `md5(pg_get_functiondef(...))` değeri 3. adımdaki beklenene eşit; `list_migrations` yeni satırı gösteriyor; o satırın `md5(statements[1])` değeri dosya md5'ine eşit.
2. **`get_advisors`** (security ve performance): yeni uyarı yok; varsa yaz ve değerlendir.
3. **Bağımsız SELECT:** migration'ın amacını doğrudan ölçen bir sorgu (yeni sütun var mı, policy adı ve tanımı doğru mu, grant beklenen rolde mi). Migration'ın kendi çıktısı kanıt sayılmaz.

## 7. Dosya adı = canlı ledger sürümü
- **Ekleyen:** MCP sürüme kendi uygulama anını yazar. Dosya bu sürümle yeniden adlandırılır (`<ledger-sürümü>_<ad>.sql`), canlı ledger'a dokunulmaz; değişiklik trenle main'e gider.
- **Silen:** main'e kendi adıyla girer; canlıya uygulanınca ledger satırı dosya adına eşlenir (önce satırın yedeği, 4. adım): `update supabase_migrations.schema_migrations set version = '<repo-sürümü>' where name = '<ad>' and version = '<damga>';`
- Sonuç thread'e: sınıf, kapı kanıtı (ONAY sha'sı, "gönder" ya da Mert'in "evet"i), yedek yolu, ledger sürümü, üç doğrulamanın sonucu.

## Bilinen tuzaklar
- **Ledger sürümü dosya öneki değildir:** canlı sürüm MCP'nin uygulama anıdır (sunucu saati, UTC'nin yaklaşık 3 saat ilerisinde); dosyadaki önek yok sayılır. Bu yüzden 7. adım var.
- **Beklenen md5 yerelde, geri alınan işlemde hesaplanır;** canlıdan sonra hesaplanan değer kanıt değildir.
- **MCP dosyayı tek sorgu olarak gönderir, CLI ifade ifade koşar:** canlıda (MCP) tüm dosya tek örtük işlemdir; yerelde `supabase db start`, CI'ın db işi ve `pnpm db:schema` her ifadeyi ayrı işlemde koşar. Üst düzey `LOCK TABLE` orada hata verir, üst düzey `SET LOCAL` yalnız uyarır ve etkisizdir; ertelenmiş kısıt tetikleyicileri her ifadenin sonunda çalışır. Bitene kadar tutması gereken kontrolü (kilit + sayım + DDL) tek `do` bloğuna koy, içinde `perform set_config('lock_timeout', '5s', true)`. `begin; … rollback;` denemesi bu farkı göstermez; yalnız `pnpm db:schema` ya da dalın CI'ı gösterir.
- **Silen migration yalnız trenin CI'ı yeşil olunca.**
- `supabase db push`, `supabase link`, `--db-url` yasak (ayar dosyası da reddeder).
