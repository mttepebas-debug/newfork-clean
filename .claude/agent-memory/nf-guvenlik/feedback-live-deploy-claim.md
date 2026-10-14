---
name: feedback-live-deploy-claim
description: Sıra (OPS-03) cevabını "canlı bu repodan yayın almıyor" gibi bir kayda dayandırmadan önce canlı yayını ölç; 2026-09-30 yanlış kayıt yüzünden canlıda çekmece 500 verdi
metadata:
  type: feedback
---

Sıra sorusunun (önce canlı migration mı, önce main mi) cevabı, main'in canlıya yayın alıp almadığına bağlıdır. Bunu backlog kaydından (BL-426 gibi) ya da bir rapordan alma; o gün ölç:
- Vercel CLI: `vercel ls <proje> --scope <ekip> --prod` — son üretim yayını ne zaman, hangi commit'ten.
- Ya da canlı web paketindeki Supabase adresi ve API'nin `/health` ucu: canlı kod hangi veritabanıyla konuşuyor.
Ölçemiyorsan (izin yok, erişim yok) cevabı "ölçülmedi" diye yaz ve OPS-03'ü gevşetmeden uygula: önce canlı migration, sonra main.

**Why:** 2026-09-30 EMP-001 C ve G8a incelemelerinde "canlı bu repodan yayın almıyor (BL-426)" kaydına dayanıp "main önce girebilir" dedim. Kayıt başka bir Vercel hesabındaki eski projeye bakılarak yazılmıştı; bu repo `newfork-clean-api` projesine bağlı ve main'e her gönderimde yayın alıyor. EMP-001 C main'e 08:20'de girdi, canlı migration 10:40'ta gitti; arada canlıda Employees çekmecesi 500 verdi (API zorunlu `is_workspace_owner` alanını bekliyordu).

**How to apply:** her incelemede sıra sorusu varsa önce yukarıdaki iki ölçümden birini koş (koşamıyorsan koordinatörden iste); raporda ölçümün kaynağını ve saatini yaz. Shared şemaya zorunlu alan ya da okuma şekli değişikliği varsa varsayılan hep OPS-03'tür. İlgili: [[checklist-contract-real-db-shape]].
