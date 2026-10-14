---
name: lineup-free-themes
description: Free-hand Lineup theme mockups 1-7 Mert asked for on 2026-10-13 (no project rules, no code base); which he liked and where files live
metadata:
  type: project
---

Mert 2026-10-13 asked the Lineup thread for theme mockups "kendi hür iradenle" (ignore project design rules; mockup HTML only, never touch the code base).

- Builder: /mnt/project-files/pages/gorsel-kararlar/gelen/lineup/kaynak/tema.py N (recolors core+a+b+c CSS per theme, appends tema-N.css, body class tema-N). Outputs lineup/tema-N-*/index.html; downloads /mnt/project-files/pages/lineup-indir/Lineup-Tema-N-*.html. None published (artifact limit).
- 1 Service (dark graphite, amber, mono), 2 Menu (warm paper, serif, oxblood) = Mert LIKED 2: "sade, şık, designer elinden çıkmış gibi".
- Menu design-language page lineup-indir/Menu-Tasarim-Dili.html. Told Mert it is not enough alone for the whole app. Offered: publish as Design System artifact (type_url https://claude.ai/artifact/5M7UeXXcx16TP3vzVFNDzd) after 00:00Z if he says yes.
- 3 Signal, 4 Soft, 5 Receipt: Mert said "futuristik, biraz genç işi".
- His brief for the next ones: "kaliteli, duru, şık, dengeli, kullanıcı dostu, kendine has sanatsal görsel tarzı olan, markaya değer katan".
- 10:35Z delivered 6 Porcelain (cool porcelain, cobalt glaze action, vermilion destructive, Instrument Serif + Geist, plate-rim rings, scalloped glaze band) and 7 Travertine (honed stone grain, sage action, terracotta destructive, brass line + brass-ink #775820 for text, arch motif, Marcellus + Hanken Grotesk). Small-text contrast checked AA.

- 10:38Z Mert: "bu temaları başka bir şey için istedim ben. newfork-clean design temamızı kullanacağız." The themes are NOT for the app; Newfork keeps its own design language. Never propose switching the app to one of them. Mert 10:38Z: "artifactlarda var design temamız" = Design System artifact "Newfork" https://claude.ai/artifact/KxiYpZDfHAUSN8KffLNxRV (synced from code 2026-10-04; 9 days behind: app has 11 newer theme tokens, theme-border-control now #7f8c86). Lineup mockup already matches it. Mert 10:43Z: build with TODAY's app design language (current code tokens); the stale Design System artifact stays as reference only, do NOT update it.

**Why:** the themes serve another purpose of Mert's; a later Claude needs the files and his reactions.
**How to apply:** edit tema-N.css, run tema.py N, Playwright-check A/B/C + phone, copy to lineup-indir. Related: [[lineup-plan-thread]].
- 10:55Z: Mert "bekliyorum" = the 2 studies must be in TODAY's Newfork language. Delivered 8 Çatal (flat white panels, borders, tine/fork mark for brand, location, shift; triple hairline on card tops) and 9 Gösterge (layered, shift colour as left channel, ruled dept labels, segmented ack gauge, square 4px tags, amber today tick, mono time inputs). Theme tokens + Inter only. Files lineup-indir/Lineup-Calisma-8-Catal.html, -9-Gosterge.html; layers kaynak/tema-8.css, tema-9.css (tema.py 8 9, fn=same skips recolor).
