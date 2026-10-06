# EKRAN-01 UNDO-db-bulgu — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 01 Schedule | UNDO-db-bulgu — takas geri yüklemesi Undo adımı değil (W-1b S2 incelemesinin Orta bulgusu) | `nf-db` / veri hattı | R2 | ONAY @21387bce (`nf-guvenlik`, tek tur) | 2026-10-06 |

## Sonrası için
- **Kalıp:** Açık düzenlemeye yazan ama ekranın adımı olmayan her yol `app_private.schedule_edit_undo_barrier()` çağırır; `schedule_edit_session_undo` testinin 10. bölümü listeyi ve sayıyı (şimdi 4) sabitler.
- **Tuzak:** 10. bölümdeki tarama yalnız doğrudan yazılmış `insert`/`update`/`delete`'i görür; `execute format(...)` ile yazan bir fonksiyon kaçar (bugün yok).
- **Tuzak:** Ön planda çağrılan alt ajanın raporu `tasks/<id>.output`'ta değil, `~/.claude/projects/<proje>/<oturum>/subagents/agent-<id>.jsonl`'dadır.

## Rapor
**Karar:** ONAY @21387bce (R2, bulgu yok). **İzin:** R2 — izinsiz gönderim; canlı migration koordinatörün CANLI-ESIT izniyle. **Risk:** 🟢 yetki, grant değişmedi. **Soru:** yok. **Sonraki:** EKRAN-02 A1.

- **Öncesi:** Schedule → Edit → onaylı takas yüzünden kayıt reddedilince müdür "Approved assignments restored" ile vardiyayı takası alan kişiye döndürüyordu; bu bir Undo adımıydı. Ör. Ali'nin Salı vardiyası Emre'ye geçti, müdür geri yükledi, Ctrl+Z'ye bastı: vardiya yine Ali'de, kayıt yine reddedildi.
- **Sonrası:** Geri yükleme, takasın kendisi gibi, düzenlemenin Undo geçmişini siler; cevapta `undo_depth` 0, Undo `PT409 schedule.nothing_to_undo`. Geri yükleme hiçbir şey değiştirmezse geçmiş korunur.
- **Kanıt:** migration `supabase/migrations/20261007130000_restoring_a_swap_is_not_an_undo_step.sql` (yerel tanımla `diff`: yalnız iki satır); test `schedule_edit_session_undo` migration'sız 52, 53, 57 kırmızı, migration'la 57/57; komşu 4 dosya yeşil (2026-10-06, yerel DB, geri alınan transaction).
- **Ekranda:** görünür değişiklik yok; geri yüklemeden sonra Undo düğmesi soluk kalır (web hattı `undo_depth`'i okuyor).

## İnceleme

### Tur 1 (`21387bce`) — `nf-guvenlik`

KARAR: ONAY @21387bce

Delegasyon: R2, tek bağımsız inceleme (`nf-guvenlik`). Görsel QA gerekmiyor, ekran değişmedi.

**Koordinatör için 5 satır**
- **Karar:** ONAY @21387bce, R2.
- **İzin:** Benden yok. Gönderim R2 kuralına göre yapılır. Migration canlıya OPS-03 sırasıyla gider; bu commit veritabanını değiştirdiği için migration kapısı geçerli.
- **Risk:** 🟢 Kritik, Yüksek ya da Orta bulgu yok. Kişiler, yetkiler ve veriye kimin erişebildiği değişmedi.
- **Soru:** yok.
- **Sonraki:** Oturum migration'ı `main.lock` penceresinde yerel DB'ye uygular, rebase sonrası tam kapı ve `test:db` koşar, sonra gönderir.

## Ne değişti (kod okumayan biri için)

Önce: Schedule düzenlerken onaylı bir takas yüzünden kayıt reddedilirse müdür "Approved assignments restored" ile vardiyayı takası alan kişiye döndürüyordu. Bu geri yükleme sıradan bir Undo adımı sayılıyordu. Ctrl+Z vardiyayı yeniden takası veren kişiye koyuyor, kayıt yine reddediliyor ve müdür döngüye giriyordu.

Sonra: Geri yükleme, takasın kendisi gibi, düzenlemenin Undo geçmişini siliyor. Geri yüklemeden sonra Undo düğmesi pasif kalıyor; sunucu da "nothing to undo" diyor.

## Bulgular

**Kritik / Yüksek / Orta:** yok.

**Düşük:** yok.

İstenen her noktanın kontrol sonucu:

1. **Sınırın yeri doğru.**
   - `perform app_private.schedule_edit_undo_barrier();` bütün yazımlardan ve oturum sürümünün artırılmasından sonra çağrılıyor.
   - Cevap üretilmeden önce çağrıldığı için dönen `undo_depth` 0.
   - Sınır yalnız bu çağrıda vardiya yazılan oturumun geçmişini siliyor. Bu fonksiyon yalnız kendi oturumuna (`sid`) yazıyor; başka oturuma ya da başka workspace'e dokunmuyor.
2. **İdempotent tekrar yolu etkilenmedi.**
   - Aynı anahtarla gelen tekrar çağrı erken dönüyor ve ilk çağrının kayıtlı cevabını veriyor. İlk çağrının cevabı sınırdan sonra üretildiği için kayıtlı cevapta `undo_depth` 0.
   - Tekrarda yazım yok, sınır da çalışmıyor. Bu doğru: ikinci çağrı geçmişe dokunmamalı.
   - Önizleme yolu (parmak izi boş) okumadan sonra dönüyor ve sınıra ulaşmıyor; bu da doğru.
3. **Geri yükleme bir şey değiştirmezse geçmiş korunuyor.**
   - Liste boşsa hiçbir satır yazılmıyor, dolayısıyla bu çağrıda kaydedilen adım da yok.
   - Sınır yalnız bu çağrıda adım bırakan oturumları sildiği için hiçbir şey silmiyor; müdürün önceki Undo adımları duruyor. Hiçbir şey geri yüklenmedi, Undo'yu kesmek için de sebep yok.
4. **Yetki ve grant değişmedi.**
   - Fonksiyonun gövdesini önceki tanımla (`20260926200000_shift_labels_come_from_the_catalog.sql:374`) boşluk duyarsız karşılaştırdım. Tek fark eklenen iki satır: yorum ve sınır çağrısı.
   - İmza aynı: `(uuid, uuid, uuid, text, uuid)`. CREATE OR REPLACE izinleri koruyor.
   - Yerel katalogda izinler: yalnız `postgres` ve `service_role` çalıştırabiliyor. `authenticated` ve `anon` çalıştıramıyor.
   - `schedule_edit_undo_barrier` yalnız `postgres` tarafından çalıştırılabiliyor.
   - SECURITY DEFINER ve `search_path ''` duruyor. Oturum sahibi kontrolü, kapsam kontrolü ve advisory lock aynen yerinde.
5. **Test boşa geçmiyor.** Migration'sız koşuda 52, 53 ve 57 kırmızı. 52'de beklenen 0, bulunan 2: müdürün önceki "add" adımı artı geri yüklemenin kendi adımı. Yani test iki şeyi birden kanıtlıyor: geri yükleme adım olarak kaydedilmiyor ve sınır önceki geçmişi de siliyor.
6. **"Adım olmayan" başka yazan yok.**
   - Yerel katalogda `schedule_edit_session_shifts` adını içeren 27 fonksiyon var.
   - Testteki listede olmayan dokuzunu ayrıca taradım: `insert`, `update`, `delete`, `merge` ya da `truncate` ile yazan yok.
   - Bu tabloya bağlı silme yayılması (cascade) yalnız oturum silinince oluyor. Adımı kaydeden tetik, aktif oturum yoksa bir şey yazmıyor.

## Öneri (zevk notu, bulgu değil)

Bölüm 10'daki "her yazan listede" kontrolü yalnız doğrudan yazılmış `insert`/`update`/`delete` cümlelerini yakalıyor; dinamik SQL ile (`execute format(...)`) yapılan bir yazım bu kontrolden kaçar. Bugün böyle bir yazan yok; ileride testin yorumuna bu sınır yazılabilir.

## Kanıt

- `git log origin/main..HEAD`: dalda tek kod commit'i `21387bce` var; tabanı `48de63c5` (origin/main). Diff iki dosyaya dokunuyor: migration (+81) ve test (+34 −5).
- Önceki tanımla karşılaştırma: yalnız iki satır eklenmiş.
- Yerel katalog, salt okuma:
  - `schema_migrations` 20261007120000'de bitiyor; bu migration yerelde uygulanmamış.
  - İzinler yukarıdaki gibi.
  - Tablonun bağlı olduğu tablolarla ilişkisi: lokasyon, kişi, iş ve vardiya türü için silme engelli (`r`), yalnız oturum için yayılıyor (`c`).
- pgTAP, `db.lock` altında, rollback ile:
  - Migration ile: `begin;` + migration + test, tek psql oturumu. Sonuç 57/57 `ok`, 0 `not ok`, ROLLBACK.
  - Migration'sız: aynı test. `not ok` 52 (beklenen 0, bulunan 2), 53 ve 57. Diğer 54 test yeşil, ROLLBACK.
- Koşudan sonra yerel DB temiz: migration kaydı 0, fonksiyon gövdesinde sınır çağrısı yok (`f`). `db.lock` bırakıldı.
- Komşu test dosyalarını (`shift_exchanges_v1` vb.) yeniden koşmadım. Oturum yeşil ölçtü; değişiklik yalnız bir sınır çağrısı ve geçmiş boşsa hiçbir şey silmiyor. Kanıtı rebase sonrası tam `test:db` verir.

Hafıza notu yazmak istedim ("barrier yazanları kontrol listesi"); bu oturumda dosya yazma kapalı olduğu için yazılmadı.

İlgili dosyalar:
- `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83\supabase\migrations\20261007130000_restoring_a_swap_is_not_an_undo_step.sql`
- `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83\supabase\tests\schedule_edit_session_undo.test.sql`
- `C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\gallant-feistel-508e83\supabase\migrations\20261007120000_schedule_undo_goes_back_on_the_server.sql` (sınır fonksiyonu, satır 95–104)
