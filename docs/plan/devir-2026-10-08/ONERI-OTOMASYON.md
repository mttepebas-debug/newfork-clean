# Otomasyon önerileri (claude-automation-recommender, 2026-10-08) — UYGULANMADI

Mert `/claude-code-setup:claude-automation-recommender` çalıştırdı; koordinatör bugünkü sorunlara göre (kurallar atlanıyor, kural dosyası uzun, gönderim yavaş, kırmızı CI yanlış teşhis) aşağıdakileri önerdi. Mert "bu rapora uygun baştan sona ilerlemeyi yap" dedi; iş başlamadan "1 saniye pause al" dedi; sonra bu devir istendi. Hiçbiri uygulanmadı.

## Proje profili (ölçüm)
pnpm + turbo, TypeScript; React 19 / Vite 7 / React Router 7 / TanStack Query 5; Fastify 5 / zod 4; Supabase/Postgres; Playwright + vitest + pgTAP. 335 web, 126 API dosyası; 446 migration; 174 pgTAP; 23 e2e. Mevcut kancalar: guard, inbox, decision-log; 80 yasak; alt ajan nf-guvenlik, nf-okur; skill gece-modu, haftalik-denetim; Supabase, GitHub, tarayıcı bağlı. Claude Code belgesi: CLAUDE.md bağlamdır, zorlama için kanca; dosya başına hedef <200 satır; alt klasör CLAUDE.md'leri o klasörde dosya okununca yüklenir; skill'ler yalnız çağrılınca yüklenir; `.claude/rules/` yola göre kural.

## Öneriler (önerilen sıra)
1. **`koordinator` skill'i** — kök CLAUDE.md'nin ~%37'si (yalnız koordinatörün işi: §4.2, gece modu, denetim, kayıtlar, dosya haritası, §5, ilke tablosu) `.claude/skills/koordinator/SKILL.md`'ye taşınır; işçi oturumlar yüklemez. Uzmanlık kuralları klasör CLAUDE.md'lerine: yetki (§2.A.1–2) → `supabase/CLAUDE.md`, `apps/api/CLAUDE.md`; arayüz ve erişilebilirlik (§2.A.7–8) → `apps/web/CLAUDE.md`. Hedef kök ~100–120 satır, kural kaybı yok.
2. **`gonder` skill'i + `scripts/ship.mjs`** — gönderimin 5 adımı tek komut: `select` (etkilenen testler: `vitest related`, pgTAP ve e2e eşleme), `branch`, `main` (dal CI'ı patch-id eşdeğeriyle yeşil mi, `main.lock`, ff push, haber), `status`. DERSLER: "kapı sonucu okunmadan push", "kilit alınamadı ama push gitti", "e2e koşulmadan main" (3 kez). → OTOMASYON-5 (PARALEL-1'in anlama notu `PARALEL-1.md`'de: dal yeniden adlandırma, patch-id sınırları, test düzeyinde "bilinen kırmızı", docs-only push'un CI'sız muafiyeti, `migration up` yerine `psql -1`, e2e raporcusunun silinmesi, 10-14/10-15 tarih farkı, settings.json için Mert'in "evet"i, atlanacak sistem mesajları).
3. **UserPromptSubmit hatırlatma kancası** — yalnız koordinatör oturumunda (`coordinator.json` session_id), Mert'in mesajında 3–4 satır `additionalContext`: anlama adımı, Bence, tam yol + bağlantı, elenen seçenekler. Engellemez. (İsteğe bağlı ikinci: Stop'ta göreli yol / açıklamasız iç numara uyarısı.)
4. **`nf-ci-triage` alt ajanı** (Opus 5.5, medium, salt okur) — kırmızı CI'ı yük / kod (commit) / altyapı diye ayırır: düşen testler, son yeşil koşuyla süre karşılaştırması, makine yükü. "Önce geri al" kuralının teşhis ayağı.
5. **context7 MCP** (kütüphane belgeleri; React 19, Vite 7, Fastify 5, zod 4 yeni sürümler) ve **hookify** eklentisi (kuralı düz cümleden kancaya) — ikisi `C:\Users\TheWe\.claude\plugins\cache\claude-plugins-official\` altında hazır, açık değil.

Elenenler: her düzenlemede format/lint/typecheck kancası (turbo typecheck yavaş, hız hedefine ters), test yazan alt ajan (TDD skill var), Memory MCP (otomatik hafıza var), GitHub MCP (eklentisi var), Linear/Slack (kullanılmıyor).

Kaynaklar: https://code.claude.com/docs/en/memory , https://code.claude.com/docs/en/hooks
