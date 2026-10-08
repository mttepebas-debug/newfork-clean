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

### Koordinatör onayı (2026-10-08 ~12:40Z, `98f9b235`), şartlarıyla
1. `inbox.mjs`, `lock.mjs`, `guard.mjs` ve `package.json` değişiklikleri TREN-ARACI (PARALEL-1) main'e girdikten sonra, güncel main'e taşınarak. Şimdilik yalnız yeni dosyalar.
2. Guard ikiz koruması ILKELER P16 kalıbıyla: 2026-10-14'e kadar uyarı + `audit.log`, sonra engel.
3. Bakım: Docker/WSL kapalı; push yok, kilit yok.

### Deneme: öbür hesabın sohbetini açmak (2026-10-08 ~11:45Z)
- Terminaldeki `claude` (2.1.292) düz bir istekte bile "You've hit your weekly limit · resets Oct 11, 1pm (America/Los_Angeles)" dedi.
  - Bu hesabın (masaüstü) haftalık sayacı %51 ve 2026-10-11T08:00Z'de yenileniyor; yani iki ayrı sayaç.
  - `claude auth status` bu hesabı gösterse de terminal büyük ihtimalle öbür hesabın girişini kullanıyor.
- Ölçülemedi: istek hiç gönderilmedi (0 token), eski kayıt değişmedi (`c38761fb…`, 520377 bayt önce ve sonra).
- **Tasarıma etkisi:** devir listesi eski sohbeti açmak için terminal komutu değil, masaüstünde yeni oturumda `/resume <kimlik>` gösterecek. Hesaplar arası çalıştığı Mert'le gerçek hesap değişiminde bir kez denenecek.
- **Doğrulandı (Mert, 2026-10-08):** Hesap 2'nin haftalık limiti dolu (claude.ai → Settings → Usage); terminaldeki `claude` Hesap 2 girişiyle çalışıyor. Hesap 2, 2026-10-11 13:00 PT'de (20:00Z) açılıyor. Uçtan uca hesap değişimi testi bu tarihten sonra.

### Ara çözüm: `/devral` komutu (2026-10-08)
- Mert'in isteğiyle kullanıcı düzeyinde komut: `C:/Users/TheWe/.claude/commands/devral.md`. İki hesap için ortak; repoya girmesi tren gerektirdiği için şimdilik orada.
- Bugünkü parçalarla çalışıyor:
  - `inbox.mjs board`, `lock.mjs status`, HANDOFF;
  - kirli worktree'ler;
  - eski sohbet kaydının son ~300 satırı (Claude'un ve Mert'in son mesajları).
- `devir` ve `lock adopt` gelince onları kullanacak biçimde yazıldı.
- Test planı (Hesap 2 açılınca): Hesap 1'de bir oturuma uydurma bir "şifre" bırak → çıkış → Hesap 2'de `/devral şifre testi` → yeni oturum şifreyi söylemeli.
- Aşama 1 bitince bu komut repoya taşınmalı mı (tek kaynak), karar koordinatörde.

### Yapılan: sayfa galerisi (TDD)
- `scripts/pages.mjs` + `scripts/pages.test.mjs`.
  - Kırmızı: modül yok, sonra boş iskelette 11/13 düştü.
  - Yeşil: 13/13 (`node --test scripts/pages.test.mjs`).
  - Bulunan hata: başlıkta `<` olunca başlık okunamıyordu; düzeltildi.
- Bozma denemesi: başlık kaçışı kaldırılınca test 4, sıralama ters çevrilince test 3 düştü.
- Gerçek klasör `C:/Users/TheWe/Documents/Codex/newfork-pages/`:
  - `README.md` → `pages.json`'a çevrildi ve silindi.
  - Dosya saatleri yayın sürümü zamanlarına çekildi.
  - `index.html` 12 satır üretti: 11 dosya + yalnız linki olan 1 sayfa (Hesap 2'nin "Newfork — Pre-business & Settings").
- Ölçüm (Playwright, Chrome):
  - 1440 ve 390'da yatay kayma yok.
  - Satır yüksekliği masaüstünde hep 74 px; telefonda dosyalı 11 satır 133 px, dosyasız satır 113 px.
  - Hesap düğmeleri 30 px.
  - Ada tıklayınca yerel dosya açılıyor.
  - Ekran görüntüleri: `artifacts/OTOMASYON-4/galeri-1440.png`, `galeri-390.png` (ana klasör).
- Eslint yalnız `**/*.{ts,tsx}` tarıyor; `.mjs` kapsam dışı, `node --check` temiz.
- `package.json` test listesine `pages.test.mjs` eklemek, TREN-ARACI'dan sonra (1. şart).

### Yapılan: devir mantığı ayrı dosyada (2026-10-08, teknik karar, P19)
- Plandaki `inbox.mjs devir/handoff`, `lock.mjs adopt` ve `hook start` tek yeni dosyada: `scripts/devir.mjs` (`liste`, `devret`, `kilit-al`, `hook start`). Nedeni: TREN-ARACI ile aynı dosyalara girmemek ve ortak betiklere yalnız bağlantı satırı eklemek. `lock.mjs`'e hiç dokunulmuyor; kilit dosyası biçimi (JSON: identity, purpose, startedAt, session, cwd) aynen korunuyor, `adoptedFrom` ve `adoptedAt` ekleniyor.
- Durum kaydı `<inbox>/durum/<oturum>.json`:
  - Hesap, transkriptteki `credential_org` satırından alınıyor. `.claude.json` yalnız açılış satırında o anki hesabı bulmak için okunuyor; yalnız `organizationUuid` okunuyor.
  - Hesap adları `<inbox>/hesaplar.json`'da.
- Testler:
  - `scripts/devir.test.mjs` 18/18 yeşil.
  - Bozma denemesi 4/4 yakalandı: beceri metni "Mert" sayıldı, bitmiş oturum listede kaldı, canlı sahibin kilidi alındı, hesap ayrımı yok sayıldı.
- Gerçek veri: bu oturumun 11,4 MB transkripti 103 ms (3 git çağrısı ve kilit durumu dahil). Mert'in son mesajı doğru yakalandı.
- Bağlananlar: `.claude/settings.json` SessionStart → `devir.mjs hook start`, CLAUDE.md §4.2 "Hesap değişimi", `/devral` yeni komutlara uyarlandı.
- **TREN-ARACI sonrasına kalan:**
  - `inbox.mjs` `heartbeat()` yazdığında `writeDurum` (bağlantı satırı);
  - `guard.mjs` `evaluate` devredilmiş oturum için P16 kalıbıyla uyarı/engel; kırmızı testi hazır: `scripts/guard-devir.test.mjs` 3/5 düşüyor;
  - `package.json` test listesine `pages`, `devir` ve `guard-devir` testleri.
