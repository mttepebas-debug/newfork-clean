# Newfork — proje kuralları

Genel kurallar (task başlangıcı, git/worktree, test zamanı, token) `~/.claude/CLAUDE.md` içindedir. Burada yalnızca bu projeye özel kurallar var.

## Koordinasyon modeli
- **Koordinatör (ana session):** `5a70083f-c90b-43f5-b947-cdde13ffd0c1`, checkout `newfork-clean` (main).
  - Planlama, `docs/plan/` kayıtları, task dağıtımı, review, main'e merge, push ve worktree temizliği bu session'dadır.
  - Aktif kod yazmaz.
- **Worker session:** koordinatörün verdiği tek task'ı kendi worktree/branch'inde yapar.
  - `docs/plan/` altına yazmaz, main'e merge etmez.
  - İş bitince branch'i push eder ve SendMessage ile koordinatöre rapor verir.
  - Kapsam dışı bir bulgu çıkarsa uygulamaz, rapora ekler.
  - Karar gerekirse durur; soruyu kullanıcıya ya da koordinatöre iletir.
- **Worker rapor formatı:**
  ```
  ID / branch / son commit
  Ne değişti (dosya grupları)
  Doğrulama (komut → sonuç)
  Done kriterleri: karşılandı / eksik
  Açık risk, kapsam dışı bulgu, gereken karar
  ```
- **Task verme:** koordinatör kullanıcıyla kapsamda uzlaşır, task dosyasını yazıp commit'ler, ardından worker prompt'unu hazırlar. Prompt'ta task dosyası yolu, worktree ve branch adı, önerilen model/effort ve rapor talebi bulunur.

## Session başı (ucuz tur)
```bash
git worktree list
git status -sb
grep -H "^Status:" docs/plan/tasks/*.md
```
Ardından yalnızca [ROADMAP](docs/plan/ROADMAP.md) "Sıradaki" bölümünü ve ilgili task dosyasını oku. Başka belge okuma.

## Plan kayıtları — docs/plan/
- `ROADMAP.md`: MVP'ye kalan sıra ve sıradaki en önemli task.
- `tasks/<ID>.md`: her task için tek dosya; brief, durum ve sonuç burada. Paralel session'lar birbirinin dosyasına yazmaz. Şablon: `tasks/_TEMPLATE.md`.
- `BACKLOG.md`: aktif olmayan fikir ve bulgular, madde başına tek satır, yalnızca sona ekle.
- `DONE.md`: biten task başına tek satır, yalnızca sona ekle.
- `REUSE.md`: ortak bileşen ve sözleşme haritası. Yeni UI ya da akış yazmadan önce ilgili girdiye bak.
- Task sahiplenme: task dosyasını main checkout'ta `Status: active` yap, `git commit -- docs/plan/tasks/<ID>.md` ile tek başına commit'le, ardından worktree aç. Kapanışta aynı dosyayı `done` yap ve DONE.md'ye bir satır ekle.
- Yerel kanıt, hosted/release kanıtı sayılmaz. Kanıtı tek satır yaz (`web 10/10, typecheck PASS`).

## Worktree ve ortak kaynaklar
- Worktree yolu: `C:/Users/TheWe/Documents/Codex/newfork-wt/<id>`. Yeni worktree'de `pnpm.cmd install` çalıştır; `.env*` dosyaları git'te olmadığından ana checkout'tan kopyala (içeriklerini belgeye yazma).
- Local Supabase DB tüm worktree'lerde ortaktır. Migration uygulayacak ya da DB'yi değiştirecek task, dosyasına `DB: lock` yazar ve aynı anda yalnızca bir task bunu yapar. `supabase db reset` yalnızca kullanıcı onayıyla.
- Dev server portları 5555 (web) ve 5556 (api). Bir anda tek checkout çalıştırır. Başlatmadan önce portu kontrol et; dolu ise ikinci sunucu açma, kullanıcıya sor.
- `wip/rescue-2026-09-16` (worktree `newfork-wt/rescue`): 2026-09-16 öncesi commit'lenmemiş tüm WIP burada duruyor. Parçalar ilgili task branch'ine `git checkout wip/rescue-2026-09-16 -- <paths>` ile taşınır. Bu branch'e yeni iş yazılmaz; RESCUE-001 bitince silinir.

## Proje sabitleri
- Windows: `pnpm.cmd`. Paket filtresi `@newfork/web|api|shared|ui`. Örnek: `pnpm.cmd --filter @newfork/web exec vitest run <dosya>`, `pnpm.cmd --filter @newfork/web typecheck`.
- DB testleri: `pnpm.cmd test:db` (pgTAP). Local DB seed ile birebir aynı değil, bkz. memory `local-db-test-fixture-drift`.
- Kapsam dışı (MVP sonrası): Kiosk, Time Tracking/clock-in, break, payroll, geniş compliance, Time Entries menüsü, SSN toplama.
- Eski Codex belgeleri (AGENTS.md, docs/project) kaldırıldı; `docs/rebuild/` tarihsel referanstır ve oradaki PASS kayıtları bugünkü kanıt değildir.
