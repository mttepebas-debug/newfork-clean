# EMP-LIMIT — Employees listesi ilk 100 kişide kesilmiyor

- **İş:** EMP-LIMIT (koordinatörün küçük işi, B1a ile B1b arası) · **Rol:** `nf-backend` (web oturumu) · **Sınıf:** R2
- **Dal:** `task/emp-limit` · **Taban:** `a40f329b` · **Commit'ler:** `ca7cc482`, `b1e9e629` (+ bu kayıt)
- **Durum:** yalnız API, ekranda yeni öğe yok (eksik kişiler görünür olur) → tam kapı izniyle gönderilir.

## Sonrası için
- Employees ekranının kendi sayfalaması (EKRAN-03, 25 / 50 / 100) gelince liste hâlâ tek seferde bütün kişileri döndürür; sunucu sayfalamasına geçmek o dilimin kararı. Bu iş yalnız sessiz kesilmeyi kapattı.
- İnceleme önerisi (backlog, düşük): okumalar arasında biri eklenir / arşivlenirse offset kayabilir (biri atlanır ya da iki kez gelir), bir sonraki yenilemede düzelir.

## Rapor
- **Önce:** Employees API'si (`GET /v1/workspaces/:ws/employees`) veritabanından tek bir 100'lük sayfa isteyip onu bütün liste sayıyordu. 120 kişilik işletmede 20 kişi Employees ekranında hiç görünmüyor, ekran bunu söylemiyordu (ILKELER P09).
- **Sonra:** API kişileri 200'lük sayfalarla (veritabanının tavanı; sıra ad, sonra kimlik — kararlı) boş sayfa gelene kadar okuyor. Offset gelen satır sayısını izliyor; veritabanı tavanı ileride küçülse de kimse düşmez (inceleme önerisi 1).
- **Kanıt:** `pnpm.cmd --filter @newfork/api exec vitest run src/employees` → önce kırmızı (450 kişide 100 satır), sonra 134/134. Genişletilmiş test (450/200, 400/200, 450/100) ilk düzeltmeye karşı 100'lük tavanda kırmızı, son hâlle yeşil; dönen kişi sırası ve arama argümanı da doğrulanıyor. `typecheck` temiz.
- **Ekranda:** Employees listesi aynı; 100'ü geçen işletmede eksik kişiler de listelenir.
- **Tam kapı:** (gönderimden önce yazılır)

## İnceleme

### `nf-guvenlik` — aynen

KARAR: ONAY @ca7cc482

Sınıf R2, tek bağımsız inceleme. Yetki, tenant izolasyonu veya sır sızıntısı açısından bulgu yok; bloklayan bir şey de yok. Aşağıdakiler gelecekte bakılacak öneriler.

## Cevaplar

**(a) Sıra, atlama ve döngü**
- Sıra `lower(display_name), id`. `id` benzersiz olduğu için toplam sıra, yani eşit adlı iki kişi bile her çağrıda aynı yerde durur (`20261003010000_catalog_sorted_by_name.sql:869-871`).
- Her sayfa ayrı bir DB çağrısı. Okumalar arasında biri eklenir, arşivlenir ya da adı değişirse offset kayar: bir kişi atlanabilir ya da iki kez gelebilir. Bu eşzamanlı yazma altında nadir bir durum ve bir sonraki yenilemede düzelir. Eski kod sessizce 20 kişi kaybediyordu; yeni durum buna göre çok daha iyi. Düşük şiddet, düzeltme istemiyorum.
- Sonsuz döngü ihtimali yok. Offset her turda 200 artıyor, DB `offset greatest(page_offset,0)` ile bitiyor ve kısa sayfada çıkılıyor.
  - Tam 200'ün katı olan işletmede (örnek: 400 kişi) üçüncü çağrı boş döner, orada durur.
  - Üst sınır `ceil(n/200)+1` çağrı.

**(b) Yetki**
- Her sayfa çağrısı aynı `actorUserId` ve `workspaceId` ile gidiyor (`employee-directory-service.ts:225-235`).
- `list_employees_service` her çağrıda `employee.list` kontrolünü ve satır bazlı `authz_check`'i yeniden yapıyor.
- Ortada yetki ya da kapsam daralırsa ikinci sayfa 42501 fırlatır, `rpcFailure` onu 403/404 yapar ve toplanan kısmi liste atılır. Kısmi sızıntı yok.
- Rota kapısı, `resolveActor` ve sözleşme aynı; yeni kapı ya da fail-open eklenmemiş.

**(c) Performans**
- Her sayfa çağrısı dizin CTE'sini baştan hesaplayıp sıralıyor, yani toplam iş O(N²/200).
- Hedef müşteri 20-100 kişi, bu 1 çağrı. 450 kişi 3 çağrı, 1000 kişi 5 çağrı. Kabul edilebilir.
- PostgREST `max_rows = 1000` (`supabase/config.toml:18`) 200'lük sayfaya takılmıyor.

**(d) Test**
- `employee-directory-routes.test.ts` dosyasını koşturdum: 67/67 geçti.
- Yeni test boş değil. Eski kod `page_limit 100` ile 450 kişiden 100 döndürürdü ve test düşerdi. Bunu akıl yürüterek doğruladım, eski kodla koşturmadım.
- Yeterli bulmuyorum, ama bloklamıyor.

## Öneriler (bloklamaz)

1. **Orta, tavan bağımlılığı.** Döngünün bitiş koşulu `page.length < pageSize`, yani "kısa sayfa = bitti" (`employee-directory-service.ts:236`). Bu, DB tavanının tam olarak 200 ya da daha yüksek kalmasına dayanıyor.
   - Biri ileride tavanı 100'e indirirse ilk sayfa 100 < 200 döner ve liste bir sessiz kesilme daha yaşar.
   - `list_employees_service(..., 200, 0)` çağrısı `employees_on_the_core.test.sql:118`'de var ama tavanın 200 olduğunu sabitleyen bir iddia yok.
   - Seçenekler: (i) bitişi "boş sayfa" yapmak, bir çağrı daha pahalı ama tavandan bağımsız; (ii) pgTAP'ta tavanı sabitlemek. `nf-test` ya da `nf-db` işi.
2. **Düşük, test boşlukları.**
   - Testte `rpc` argümanları doğrulanmıyor (`page_limit 200`, offset 0/200/400, aynı `search`/`status`/`include_archived` her çağrıda).
   - Tam 200'ün katı olan vaka (400) yok.
   - Sıra ve tekrar yok iddiası yok (450 uzunluğu çift kayıtta da tutar).
   - Ortada fırlayan hata durumu yok.
   - Bunları ekleyen kısa bir test yeter.
3. **Düşük, kod.** `const people = [];` evolving-array türü. `typecheck` koşturmadım, görev yalnız tek vitest dosyasına izin veriyordu. `typecheck` kapısı CI'da zaten var.

## Kanıt
- `git diff a40f329b..ca7cc482`: iki dosya, +47 −11.
- DB fonksiyonu `20261003010000_catalog_sorted_by_name.sql:782-871` okundu. Sonraki migration'larda yeniden tanımlanmamış (grep).
- `pnpm.cmd --filter @newfork/api exec vitest run src/employees/employee-directory-routes.test.ts`: 67 passed.
- Çalışma ağacında incelenen commit dışı tek değişiklik `.claude/agent-memory/nf-guvenlik/checklist-api-gate-core-actions.md`. Bu benim değişikliğim değil, dokunmadım.

### İncelemeye cevap (`b1e9e629`)
- Öneri 1 (i) uygulandı: döngü boş sayfada biter, offset dönen satır sayısını izler; tavan küçülse de kimse düşmez. Kanıt: 450 kişi / 100'lük tavan testi `ca7cc482`'ye karşı kırmızı, `b1e9e629`'la yeşil.
- Öneri 2: test 450/200, 400/200, 450/100 vakalarını, dönen kişi sırasının birebir aynılığını (çift ya da kayıp yok) ve her çağrıda aynı aramayı doğruluyor. Ortada hata vakası eklenmedi: hata `rpcFailure` ile bütün isteği düşürüyor, kısmi liste dönmüyor (incelemenin (b) maddesi).
- Öneri 3: `people: EmployeeSummary[]` türlü; `typecheck` temiz.
