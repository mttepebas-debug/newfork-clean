# CLAUDE.md taslağı: Projects'siz çalışma (Mert'in onayını bekliyor)

Tarih: 15 Ekim 2026. Mert'in seçimi: "Taslağı hazırla" (CLAUDE.md'deki Projects'e bağlı kurallar yeni hesaba göre nasıl güncellensin sorusu).

## Ne
`CLAUDE.md` bugün işin Claude Projects'te yürüdüğünü söylüyor (§5 Roller, "İş Claude Projects'te yürür"): proje sohbetinde koordinatör, bulut thread'leri, Mert'in bilgisayarında Remote Control tren thread'i, karar kartı, `/mnt/project-files`. Yeni hesapta Projects yok. Taslak bu kısımları tek Claude Code oturumuna ("ana oturum") göre yazar.

## Nerede
- GitHub, dal `claude/hesap-devri-bqus46`, iki commit, ikisi birlikte uygulanır: `f9d83e6a` ("docs(claude): run the workflow in one Claude Code session, no Projects (draft)") ve `5cf9d7bc` ("docs(claude): keep a second reviewer for risky steps in the one-session draft"). Yalnız `CLAUDE.md` değişir.
- Main'e girmedi. Main'deki `CLAUDE.md` ile taslağın tabanı aynı (15 Ekim, main `2f2f744c`), bu yüzden iki commit sırayla temiz uygulanır.

## Önce / sonra (özet)
| Yer | Bugün | Taslakta |
|---|---|---|
| §2 başlık | proje sohbetinde koordinatör, thread'de o thread'in Claude'u | ana oturumda koordinatör, ek oturumda o oturumun Claude'u |
| §2.1 | bulut thread'i proje dosyasını `/mnt/project-files` bağlantısıyla verir | bulut oturumu repo yoluyla verir |
| §2.8 | Project'te soru karar kartıyla | Claude Code'un soru kutusuyla; son seçenek "Yazarak cevap vereceğim" |
| §2.10 | bilgisayarda koşacak iş Remote Control thread'ine | ana oturuma |
| §3.B.1 | ana klasörde iş yok | aynı; ana oturum orada açılır ama orada kod değiştirmez |
| §5 Roller | koordinatör (proje sohbeti, kod yazmaz), bulut thread'i, Remote Control thread'i | koordinatör = ana oturum (bilgisayarda; tren, yerel DB, e2e, canlı migration da onda); thread = ana oturumun bir işi ya da Mert'in açtığı ek Code oturumu; claude.ai/code yalnız yedek; proje dosyaları PD klasöründe |
| §5 iş yolu 2–3, 6 | koordinatör thread açar; tren Remote Control thread'inde | ana oturum kendisi, `nf-isci` ile ya da ek oturumla; tren ana oturumda; ek oturum tren, kayıt dosyası, `coord/kayit2` ve canlı adım yapmaz |
| §4, §5.4, §5.5 ikinci göz | riskli canlı migration'a koordinatör "gönder" der; riskli diff'i koordinatör okur | koordinatör ile işi yapan aynı oturum olduğu için: riskli canlı migration `nf-guvenlik` ONAY + Mert'in ana oturumda yazdığı "evet"; ana oturum kendi işine "gönder" veremez; kendi yazdığı riskli diff'i `nf-okur` okur |
| §6 `DURUM.md` | `/mnt/project-files/DURUM.md` | `PD\DURUM.md` |
| §7 worktree, port, sayfa | Remote Control thread'i, bulut thread'i | ana oturum; çalışma sayfaları `PD\pages\` |

PD = `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\`.

Değişmeyenler: güvenlik kuralları, test, tren adımları, canlı veritabanı kontrol listesinin adımları (yedek, `apply_migration`, md5, `get_advisors`, bağımsız SELECT), işçi sınırı 1, Mert'e soru biçimi, kayıtlar. Değişen tek onay: riskli canlı migration'da koordinatörün "gönder"i yerine Mert'in "evet"i (ikinci göz kaybolmasın diye). "Koordinatör" ve "thread" kelimeleri dosyada kalır; anlamları §5'te yeni düzene göre tanımlanır. Böylece değişiklik küçük kalır.

## Nasıl uygulanır
1. Yeni hesabın ana oturumu taslağı Mert'e gösterir (bu dosya ve commit'in farkı).
2. Mert ana oturumda kendi sözüyle "onaylıyorum" yazar (CLAUDE.md §4: kural değişikliği Mert'e).
3. Ana oturum iki commit'i kendi worktree'sinde güncel main'in üstüne alır (`git cherry-pick f9d83e6a 5cf9d7bc`) ve trenle main'e gönderir.
4. Karar defterine kayıt (`docs/plan/KARARLAR.md`, `coord/kayit2` dalı, ayrı tren): "İş Claude Code ana oturumunda yürür; Projects kullanılmaz (Mert, 2026-10-15; S-116'nın yerini alır)." Kayıt satırı Mert'in onay tarihiyle yazılır.

## Taslağın kapsamadığı, sonra bakılacak
- `scripts/ops.mjs` satır 19'daki uyarı metni "Remote Control thread'inde koşar" diyor (bulutta kilit ya da tren denenince çıkan mesaj). Davranışı doğru, yalnız kelime eski. Küçük ayrı iş (backlog adayı).
- `.claude/agents/` ve `.claude/skills/` içinde Projects kelimesi yok (15 Ekim taraması).
- `scripts/guard.mjs` (satır 418–420 civarı) yalnız alt ajanı ve `.claude/worktrees/agent-*` klasörünü işçi sayıyor; Mert'in açtığı ek Code oturumu guard'a göre işçi değil. Ek oturumun tren, kayıt dosyası ve canlı adım yasağı şimdilik yalnız kuralda; guard'a eklenmesi ayrı iş (backlog adayı).
