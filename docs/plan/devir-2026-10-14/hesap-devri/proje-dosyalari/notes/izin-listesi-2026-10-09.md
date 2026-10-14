# İzin listesi (2026-10-09)

Ne: `.claude/settings.json` dosyasına 27 "izin ver" kuralı eklendi. Yasak listesine dokunulmadı.
Nerede: dal `claude/project-thread-661ckj` @ `b75bf30` — https://github.com/mttepebas-debug/newfork-clean/blob/claude/project-thread-661ckj/.claude/settings.json
Ne zaman etkili: trenle main'e girince; her oturum ayarı kendi kopyasından okur.
Kaynak: son 42 oturum (çoğu bilgisayarındaki Remote Control oturumları), 4.566 araç çağrısı, ~3.000 komut.

## Eklenenler

| # | Kural | Sayı | Ne yapar |
|---|---|---|---|
| 1 | `Bash(node scripts/lock.mjs status)` | 293 | Veritabanı kilidinin sırasını gösterir |
| 2 | `Bash(git fetch -q origin)` + 3 eş biçim | 220 | GitHub'daki son durumu çeker (çalışma dosyalarına dokunmaz) |
| 3 | `Bash(git merge-base *)` | 34 | Bir commit main'de mi diye bakar |
| 4 | `Bash(pnpm.cmd typecheck)`, `Bash(pnpm.cmd lint)` | 62 | Tip ve stil kontrolü |
| 5 | `Bash(git cherry *)` | 30 | Dal main'e girmiş mi diye ölçer (silmeden önce) |
| 6 | `Bash(gh run watch *)` | 26 | CI koşusunu izler |
| 7 | `Bash(node scripts/schema-snapshot.mjs check-fast)` | 25 | Şema dosyası güncel mi bakar |
| 8 | `mcp__ccd_session_mgmt__list_events` / `list_sessions` / `get_session` / `get_usage` | 41 | Başka oturumların kaydını ve kullanımı okur |
| 9 | `mcp__…__get_advisors` (Supabase) | 14 | Canlı veritabanı güvenlik uyarılarını okur |
| 10 | `Bash(pnpm.cmd --filter @newfork/web typecheck)` / `lint` | 11 | Yalnız web paketinin kontrolü |
| 11 | `Bash(node scripts/main-watch.mjs)`, `--since *` | 4 | Main alarmı (CLAUDE.md §5.6, her trenden önce) |
| 12 | `mcp__Claude_Browser__get_page_text`, `preview_list` | 7 | Yan tarayıcıda sayfa metni ve açık önizlemeler |
| 13 | `mcp__github__actions_list` | 3 | GitHub Actions listesini okur |
| 14 | Bulut eşleri: `Bash(pnpm typecheck)`, `Bash(pnpm lint)`, `Bash(pnpm --filter @newfork/web typecheck/lint)` | – | Bulut thread'lerinde aynı kontroller |

## Eklenmeyenler ve neden

- `grep`, `head`, `cat`, `sed -n`, `tail`, `ls`, `git log/diff/status/show`, `gh run list/view`, `docker ps`: zaten sormadan çalışıyor (en sık kullanılanlar bunlar).
- `node -e`, `python -`, `bash`, `docker exec`, `timeout`, `pnpm … exec vitest *`: her kodu çalıştırmaya kapı açar.
- `git add/commit/push/rebase/checkout`, `lock.mjs take/release`, `execute_sql`, `apply_migration`: yazan ya da değiştiren işler.
- `git fetch *` (joker): `--upload-pack` bayrağıyla komut çalıştırılabildiği için yalnız tam biçimler eklendi.
- `scripts/inbox.mjs`: artık depoda yok.
- PowerShell: kullanımın çoğu `ForEach-Object` ve betik bloğu (kod çalıştırır); salt okur parçalar seyrek.

## Not

Oturumlar "auto" izin modunda koşuyor; 42 oturumda gerçek izin sorusu yalnız 1 tane bulundu (soru kartı). Yani bu liste çoğunlukla otomatik izin denetiminin yükünü ve yanlış engellemelerini azaltır; görünür soru sayısı zaten çok düşük.
