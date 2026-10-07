---
name: gece-modu
description: Koordinatörün gece otomasyonu (CLAUDE.md §4.5). Mert "gece modu" deyince koordinatör oturumunda başlat, Mert'in sabah ilk mesajıyla bitir. Onaylı planı oturumları ve alt ajanları yöneterek durmadan ilerletir; kendini zamanlayıcıyla uyandırır, bilgisayarı uyanık tutar, posta kutusunu ve sessiz oturumları izler, sabah önce raporu sonra soru turunu yapar.
---

# Gece modu

Yalnız koordinatör oturumu çalıştırır (`node scripts/inbox.mjs claim` yapılmış olmalı). Gündüz kuralları aynen geçer; gece için ek yasak da gevşeme de yoktur (§4.5). Mert'e gece mesaj ya da soru gitmez.

## Başlarken (bir kez)

1. **Plan.** Onaylı planı yaz: `docs/plan/HANDOFF.md` başına "Gece modu açık (<tarih saat>)" ve hat hat sıra (oturum, iş, risk, sırada ne var). Kaynak `EKRAN-PLANI.md` ve Mert'in son talimatı; planda olmayan iş gece açılmaz, ikinci iş hattı açılmaz (§5.2).
2. **Uyanık tut.** `request_keep_awake` (`until: "session_idle"`, reason: "Gece modu: koordinatör oturumları sabaha kadar yönetiyor"). Bu tutuş oturum ~5 dk boşta kalınca biter; her tur (aşağıda, ~10 dk) yeniden ister. Bilgisayarın uyku süresi 10 dk'dan kısaysa turu sıklaştır.
3. **Posta kutusu.** Arka planda `node scripts/inbox.mjs wait 7000` (Bash, `run_in_background`). Rapor gelince çıkar ve seni uyandırır (5 sn'de bir bakar; §4.2'deki "en az 2 dakikada bir" bunu karşılar). Her çıkışta yeniden başlat.
4. **Zamanlayıcı.** `CronCreate` ile tekrarlı tur: `cron: "3-59/10 * * * *"`, prompt: `gece-modu turu: .claude/skills/gece-modu/SKILL.md "Her tur" adımları`. Dönen iş kimliğini HANDOFF'a yaz. Cron yalnız bu oturumda ve oturum boştayken çalışır; 7 gün sonra kendiliğinden biter.
5. **Kayıt.** `KOORDINATOR-KARARLARI.md`'ye gece modunun başladığı (KK, 5N1K).

## Her tur (zamanlayıcı ya da posta kutusu uyandırınca)

1. **Posta kutusu.** `wait` çıktısını VE `ls C:/Users/TheWe/Documents/Codex/.newfork-inbox/new/` oku: ack'lenmemiş eski rapor işlenmemiş demektir. Her raporu §4.4'e göre işle (commit main'de mi, main CI yeşil mi, riskli yüzeyde diff), sonra `node scripts/inbox.mjs ack <ad>`. `wait` bittiyse yeniden başlat.
2. **Sessiz oturum.** `node scripts/inbox.mjs board`. `TAKILDI` satırı (20 dk'dır ses vermeyen "working" oturum) → `list_events` ile bak, gerekirse `git -C <worktree> status` / `log`. Takıldıysa mesajla yön ver; bozulduysa devral ya da yeniden başlat. Ne olduğunu sabah notuna yaz.
3. **Ağır koşu.** `node scripts/lock.mjs status` ve `gh run list --limit 3`. Aynı anda tek ağır koşu (§4.2): `heavy.lock` sahibini ve CI'ı gör, sıradaki ağır işi buna göre başlat. 2 saatten eski kilit silinmez; sahibine bak. Main kırmızıysa §6 "CI": önce ayır (kod mu, yük mü), yalnız düşen işi yeniden koştur.
4. **Planı ilerlet.** Boşta oturum + sırada iş → görev mesajı (rol, iş kimliği, risk sınıfı, önerilen skill'ler). Gönderim izni §4.2 ve §5.1 koşullarıyla (R3 ve canlı veritabanı açık "gönder" ister; canlı migration önce yedek). Mert'e gidecek her soru `docs/plan/SABAH-SORULAR.md`'ye, §3.6 biçimiyle; o soruya bağlı iş bekler, bağlı olmayan sürer. Senin verdiğin her karar `KOORDINATOR-KARARLARI.md`'ye (§5.1).
5. **Bağlam ve kullanım.** `get_usage`: kendi bağlamın %50'yi geçtiyse ilk iş sınırında `HANDOFF.md` devri; plan limitleri azaldıysa pahalı işler sona, ucuz işler sürer (§4.2).
6. **Sabah notu.** `HANDOFF.md` "Gece" bölümünü güncel tut: ne bitti (sha), ne canlıda, hat hat nerede takıldı ve ne kadar ilerledi (ör. "EKRAN-02 A4: 3 adımdan 2'si, test:db kırmızı, neden …").
7. Değişiklik yoksa turu tek satırla bitir; sorun yokken rapor yazma.

## Sabah (Mert'in ilk mesajı gece modunu bitirir)

1. `CronDelete` (HANDOFF'taki iş kimliği). Arka plandaki `wait`'i sürdür (gündüz de koordinatör onu kullanır).
2. **Önce sabah raporu** (§4.4 Mert'e rapor biçimi): ne bitti (DONE bağlantıları, sha), ne canlıda (main, CI, canlı migration), nerede takıldı ve ne kadar ilerledi (hat hat), "senin yerine verdiğim kararlar" (KK numaralarıyla), plan ilerlemesi. Ekran görüntüleri `SendUserFile` ile.
3. **Sonra soru turu** (§3.7): `SABAH-SORULAR.md`'deki sorular, `AskUserQuestion` ile, §3.6 biçimi (karar kaydı kancası etiketi ve "Dayanak:" satırını zorlar). Cevaplar `KARARLAR.md` / `KOORDINATOR-KARARLARI.md`'ye işlenir, soru dosyadan silinir, bağlı işler başlar.
4. `HANDOFF.md` başındaki "Gece modu açık" satırı kapanır; KK'ye bitiş satırı.
