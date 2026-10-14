# Swap onay penceresi: Önce / Sonra sayfası

Mert'in B4 bakışı için: Requests ekranı ve takas onay penceresi, bugünkü main (`d68aa958`) ile `task/ekran-02-c2r` dalı (`8ef7b05a`) yan yana. İkisi de gerçek `apps/web` kodu, atlasın sahte arka ucuyla (Harbor & Vine). Repo'ya hiçbir şey yazılmadı; dala dokunulmadı.

- Yayın: https://claude.ai/artifact/CpHTbbxgUhEqwmEfXBjGia (yeni sürümler aynı bağlantıya; v1 2026-10-09 10:10Z; v4 10:25Z: New artık `claude/project-thread-jcgonw@394dfb04` kurtarma dalından, Employees Original / New bölümü eklendi: `emp-original.html`, `emp-new.html`; v5 2026-10-11: Mert'in iki sekme isteği, dal @1700a07b + `patch/iki-sekme.diff` (yalnız bu sayfa için, dala yazılmadı); `new.html` = New A (All · Time off · Shift changes), `new-b.html` = New B (All yok), derleme `TABS_ALL=1/0`).
- Dosyalar: `index.html` (sayfa: Türkçe anlatım, Original / New / Yan yana, Masaüstü 1440 / Telefon 390, G13 soruları), `original.html` (main derlemesi), `new.html` (c2r derlemesi). İkisi iframe ile açılır.
- `source/`: atlas kaynağının kopyası (`/mnt/project-files/pages/atlas/source/`), şu farklarla:
  - `mock/hub-exchanges.ts`: eligibility'ye `approval_flags` ve `measures` (20261008111900 migration'ının mantığı, kural 30 dk yol / 600 dk dinlenme); gelecek haftanın vardiyalarında 8 örnek takas (temiz, yol, dinlenme, "No shift nearby", birden çok uyarı, izin kutusu, kilitli, izinle çakıştığı için onaylanamayan). Örneklerin önizleme değerleri `demo` alanından gelir; onay komutu gerçek kontrolü kullanır.
  - `mock/store.ts`, `mock/world.ts`, `mock/viewer.ts`: localStorage anahtarına `__ATLAS_NS__` öneki (iki iframe aynı kökende, verileri karışmasın).
  - `mock/people.ts`: Employees sayfalaması görünsün diye 20 ek kişi (HV-026…HV-045).
  - `harness.ts`, `vite.config.ts`: `ATLAS_LABEL` (köşe düğmesi adı), `ATLAS_NS`, `ATLAS_SHA` serbest metin.

## Derleme (bulut thread'i)
1. İki worktree: `git worktree add --detach <yer>/wt-main origin/main` ve `... <yer>/wt-c2r origin/task/ekran-02-c2r`; ikisinde `pnpm install --frozen-lockfile`.
2. Her birinde `cp -r source/. apps/web/.temp/atlas/`.
3. `apps/web` içinde: `ATLAS_NS=orig. ATLAS_LABEL=Original ATLAS_SHA="main d68aa958" ./node_modules/.bin/vite build --config .temp/atlas/vite.config.ts` (c2r için `c2r.` / `New` / `task/ekran-02-c2r 8ef7b05a`).
4. `node .temp/atlas/inline.mjs requests "Requests (Original)" <çıktı>.body`, sonra başına `<!doctype html><html><head><meta charset="utf-8">…` ekleyip `original.html` / `new.html`.
5. Scratchpad'e kopyala, `index.html`'i `files: {original.html, new.html}` ile aynı bağlantıya yayınla.
