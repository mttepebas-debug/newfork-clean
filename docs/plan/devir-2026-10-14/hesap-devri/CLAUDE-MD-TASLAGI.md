# CLAUDE.md taslağı: Projects'siz çalışma (Mert'in onayını bekliyor)

Tarih: 15 Ekim 2026. Mert'in seçimi: "Taslağı hazırla" (CLAUDE.md'deki Projects'e bağlı kurallar yeni hesaba göre nasıl güncellensin sorusu).

## Ne
`CLAUDE.md` bugün işin Claude Projects'te yürüdüğünü söylüyor (§5 Roller, "İş Claude Projects'te yürür"): proje sohbetinde koordinatör, bulut thread'leri, Mert'in bilgisayarında Remote Control tren thread'i, karar kartı, `/mnt/project-files`. Yeni hesapta Projects yok. Taslak bu kısımları tek Claude Code oturumuna ("ana oturum") göre yazar.

## Nerede
- GitHub, dal `claude/hesap-devri-bqus46`, commit `f9d83e6a` ("docs(claude): run the workflow in one Claude Code session, no Projects (draft)"). Yalnız `CLAUDE.md` değişir (18 satır).
- Main'e girmedi. Main'deki `CLAUDE.md` ile taslağın tabanı aynı (15 Ekim, main `2f2f744c`), bu yüzden tek commit olarak temiz uygulanır.

## Önce / sonra (özet)
| Yer | Bugün | Taslakta |
|---|---|---|
| §2 başlık | proje sohbetinde koordinatör, thread'de o thread'in Claude'u | ana oturumda koordinatör, ek oturumda o oturumun Claude'u |
| §2.1 | bulut thread'i proje dosyasını `/mnt/project-files` bağlantısıyla verir | bulut oturumu repo yoluyla verir |
| §2.8 | Project'te soru karar kartıyla | Claude Code'un soru kutusuyla; son seçenek "Yazarak cevap vereceğim" |
| §2.10 | bilgisayarda koşacak iş Remote Control thread'ine | ana oturuma |
| §3.B.1 | ana klasörde iş yok | aynı; ana oturum orada açılır ama orada kod değiştirmez |
| §5 Roller | koordinatör (proje sohbeti, kod yazmaz), bulut thread'i, Remote Control thread'i | koordinatör = ana oturum (bilgisayarda; tren, yerel DB, e2e, canlı migration da onda); thread = ana oturumun bir işi ya da Mert'in açtığı ek Code oturumu; claude.ai/code yalnız yedek; proje dosyaları PD klasöründe |
| §5 iş yolu 2–3, 6 | koordinatör thread açar; tren Remote Control thread'inde | ana oturum kendisi, `nf-isci` ile ya da ek oturumla; tren ana oturumda |
| §6 `DURUM.md` | `/mnt/project-files/DURUM.md` | `PD\DURUM.md` |
| §7 worktree, port, sayfa | Remote Control thread'i, bulut thread'i | ana oturum; çalışma sayfaları `PD\pages\` |

PD = `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\`.

Değişmeyenler: güvenlik kuralları, test, tren, canlı veritabanı kontrol listesi, işçi sınırı 1, Mert'e soru biçimi, kayıtlar. "Koordinatör" ve "thread" kelimeleri dosyada kalır; anlamları §5'te yeni düzene göre tanımlanır. Böylece değişiklik küçük kalır.

## Nasıl uygulanır
1. Yeni hesabın ana oturumu taslağı Mert'e gösterir (bu dosya ve commit'in farkı).
2. Mert ana oturumda kendi sözüyle "onaylıyorum" yazar (CLAUDE.md §4: kural değişikliği Mert'e).
3. Ana oturum commit'i kendi worktree'sinde güncel main'in üstüne alır (`git cherry-pick f9d83e6a`) ve trenle main'e gönderir.
4. Karar defterine kayıt (`docs/plan/KARARLAR.md`, `coord/kayit2` dalı, ayrı tren): "İş Claude Code ana oturumunda yürür; Projects kullanılmaz (Mert, 2026-10-15; S-116'nın yerini alır)." Kayıt satırı Mert'in onay tarihiyle yazılır.

## Taslağın kapsamadığı, sonra bakılacak
- `scripts/ops.mjs` satır 19'daki uyarı metni "Remote Control thread'inde koşar" diyor (bulutta kilit ya da tren denenince çıkan mesaj). Davranışı doğru, yalnız kelime eski. Küçük ayrı iş (backlog adayı).
- `.claude/agents/` ve `.claude/skills/` içinde Projects kelimesi yok (15 Ekim taraması).
