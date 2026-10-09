# Hatırlatmalar

Mert'in kendi yapacağı, zamanı kendisine bırakılan işler. Mert yaptığını koordinatöre söyler; koordinatör varsa sonraki adımı yapar ve maddeyi siler.

## Codex klasörünü sil (2026-10-08)
- **Ne:** `C:\Users\TheWe\.codex`, 14 GB (2026-10-08 ölçümü). Kaldırılan Codex uygulamasının verisi:
  - eski sohbet geçmişi ve günlükler (~9 GB);
  - eklentiler;
  - Codex'in giriş anahtarları;
  - 135 kod kopyası (~3 GB). Hepsi eski proje `C:\Users\TheWe\newfork` için; `newfork-clean`'e ait olan yok.
- **Kaybolan:** Geri gelmez. Eski projenin bir kopyasında kaydedilmemiş 13 dosya vardı (1 Eylül'den kalma Schedule işi). Silmeden önce yedeklendi: `C:\Users\TheWe\Documents\Codex\.newfork-backups\codex-worktree-da4e-2026-10-08\` (`changes.patch` + `untracked/`).
- **Nasıl:** Claude uygulamasında sağdaki Terminal panelinde, ▶ ile:

```bash
Remove-Item -LiteralPath '\\?\C:\Users\TheWe\.codex' -Recurse -Force
```

- **Sonra:** koordinatöre "sildim" de. Koordinatör eski projede silinen kopyaların kalan kayıtlarını temizler (`git -C C:\Users\TheWe\newfork worktree prune`; dosya silmez) ve bu maddeyi kaldırır.
