---
name: project-koordinator-modeli
description: Mert 2026-10-09'da Project'in koordinatörünü tek koordinatör seçti; eski yerel coord oturumu ve /oto emekliye ayrılacak
metadata:
  type: project
  modified: 2026-10-09T03:20:56.897Z
---

Mert, 2026-10-09 03:20Z, karar kartında "Project koordinatör"ü seçti: Project'in koordinatörü CLAUDE.md §5'teki koordinatörün yerini alır, thread'ler işçidir. Eski yerel koordinatör oturumu (`newfork-wt/coord`, `/oto`, `/durum`) emekliye ayrılacak; kayıtlar GitHub'a taşınacak; main'e hâlâ yalnız tren gider, tren Mert'in bilgisayarında Remote Control ile koşar.

**Why:** iki merkez (yerel coord + Project koordinatörü) aynı işi dağıtıp çakışıyordu; ayrıntı `/mnt/project-files/notes/project-uyum-raporu.md`.

**How to apply:** Kurallar main'de (CLAUDE.md §5–§6, KARARLAR S-116); işçi sınırı 1 (aynı anda tek kod yazan thread). Bulut thread'i `test:db`, e2e, kilit ve tren koşamaz (Docker yok, yollar `C:/` sabit); bunlar Remote Control ile.

Durum 2026-10-09 03:32Z: geçiş dalı `claude/project-thread-dk2dg9@0394aa8` push edildi (CLAUDE.md, KARARLAR S-116, BACKLOG BL-991/992, betikler, ci.yml). Mert seçti: BL-990 ile aynı trene biner (karantina yok); tren BL-990 yeşil olunca, Remote Control thread'inde. Trenden önce eski yerel coord oturumu ve /oto durdurulmalı.

Tamamlandı 2026-10-09 04:43Z: geçiş BL-990 ve GA-2 ile aynı trenle main'e girdi (main a1c0ce6, CI yeşil). Açık: S-116'daki git yetki devri cümlesi düştü, sonraki kayıt değişikliğiyle eklenecek ([[git-yetki-devri]]).
