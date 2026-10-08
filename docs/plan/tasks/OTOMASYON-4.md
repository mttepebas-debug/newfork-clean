# OTOMASYON-4 İki hesap, tek PC: hesap değişince kaldığı yerden devam
Status: draft
Session: 85e6b184 (oturum/guvenlik-a)   Branch: task/otomasyon-4   Worktree: ../newfork-wt/otomasyon-4   DB: -
Risk: R2 (paylaşılan araç ve kanca: inbox, lock, guard, settings.json; ürün, yetki ve veritabanı yok)
Reviewer: /code-review
Skills: TDD (her script değişikliği önce kırmızı test) · verification-before-completion ("bitti" öncesi)

Goal: Mert aynı PC'de iki Claude hesabını sırayla kullanıyor (limit dolunca çıkış → öbürüyle giriş). Masaüstü uygulamasının oturum listesi hesaba göre ayrı (`AppData\Roaming\Claude\claude-code-sessions\<hesap>\<org>\`), ama sohbet kayıtları (`~/.claude/projects`) ve hafıza ortak. Hesap değişince iş kaldığı yerden sürsün ve yayınlanan sayfaların en güncel hâli iki hesaptan görülsün. Tasarım Mert'le bölüm bölüm onaylandı (2026-10-08, karar günlüğünde).

In scope:
1. Durum kaydı: `scripts/inbox.mjs` nabzı (`heartbeat`) aynı kısıtla `.newfork-inbox/durum/<session>.json` de yazar.
   - Alanlar: başlık, hesap (yalnız `.claude.json` → `oauthAccount.emailAddress` ve `organizationUuid`), cwd, label görev ve durumu, dal/head/dirty, tuttuğu kilitler, son Claude mesajı (≤1500), son kullanıcı mesajı (≤500), `handedOff`.
   - Transkriptin son ~2 MB'ı okunur.
2. `inbox.mjs devir [--hours N]`: iki hesabın yarım oturumları tek listede, `claude --resume <id>` komutuyla. `inbox.mjs handoff <eski> [--to <yeni>]`: devredildi işareti ve `audit.log`.
3. SessionStart kancası `inbox.mjs hook start`: öbür hesapta son 24 saatte yarım oturum varsa `additionalContext` ile tek satır; yoksa hiçbir şey eklemez.
4. `scripts/lock.mjs adopt <ad> "<oturum/iş>"`: sahibi devredilmiş ya da 30 dk nabızsızsa kilidi yeni oturuma geçirir; yoksa reddeder; `audit.log`.
5. `scripts/guard.mjs`: devredilmiş oturumda Bash/PowerShell/Edit/Write reddi (okuma serbest, kaçış `NF_OVERRIDE`).
6. `scripts/pages.mjs`: `newfork-pages/pages.json` → `index.html` yerel galeri (son değişen üstte, yerel "Aç", iki hesabın linki); `link <dosya> <hesap1|hesap2> <url>`. Bugünkü `README.md` bir kez `pages.json`'a çevrilir.
7. CLAUDE.md:
   - §4.2 "Hesap değişimi" adımları;
   - §6 sayfa maddesine iki cümle: yorumla gelen değişiklik de önce dosyaya; değişiklik yalnız Claude Code'da.

Out of scope:
- GitHub Actions ya da bulut oturumu: iki hesap arası devir yolu belgelenmemiş, Actions limiti $0.
- Masaüstü uygulamasının oturum listesine dosya kopyalamak: belgelenmemiş iç yapı.
- Limit yüzdesine göre uyarı: durum kaydı en fazla 1 dakika eski olduğu için gerekmiyor.

Done when:
- Birim testleri yeşil (aşağıda), `pnpm.cmd lint` yeşil.
- Uçtan uca deneme bu PC'de geçti.
- Galeri 11 sayfayı listeliyor; ekran görüntüsü 1440 ve 390 `artifacts/OTOMASYON-4/`'te.
- `/code-review` bulguları kapatıldı; dal `TREN-HAZIR`.

Touches: `scripts/inbox.mjs`, `scripts/lock.mjs`, `scripts/guard.mjs`, `scripts/pages.mjs` (yeni), `scripts/*.test.mjs`, `package.json` (test listesi), `.claude/settings.json` (SessionStart), `CLAUDE.md`.

Test plan:
- `node --test`:
  - durum dosyası alanları dolu ve gizli alan yok;
  - kuyruk okuma son mesajı buluyor;
  - `devir` devredilmişi ve "bitti"yi göstermiyor;
  - `hook start` yalnız öbür hesapta yarım oturum varsa satır ekliyor;
  - `adopt` canlı sahibin kilidini reddediyor, devredilmişinkini alıyor;
  - guard devredilmiş oturumda Bash'i reddediyor, Read'i geçiriyor;
  - `pages.mjs` başlık, sıra ve kaçışlı HTML üretiyor.
- Uçtan uca:
  1. Deneme oturumu etiket koyup durur, `devir` gösterir.
  2. `handoff` sonrası o oturumun Bash'i reddedilir.
  3. `adopt` kilidi alır.
  4. Yeni oturum açılışında satır görünür.
- Deneme (ölçüm): bu hesap öbür hesabın bir kaydını `--fork-session` ile açabiliyor mu ve ilk mesajın limit payı ne.

Risk notes:
- Kancalar fail-open kalır (mevcut `runHook` gibi); kanca hatası oturumu durdurmaz.
- Guard engeli yanlış oturumu durdurursa iş tıkanır. Engel yalnız açıkça `handoff` yazılmış oturuma uygulanır, kaçış `NF_OVERRIDE`.
- `.claude.json`'dan yalnız iki alan okunur; jeton ya da anahtar okunmaz, yazılmaz.

## Notes / Result
(Rapor biçimi: CLAUDE.md §4.4)
