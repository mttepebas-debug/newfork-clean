# Bekleyen PAGES güncellemesi: workspace seçici Settings'in üstünde

- Kod: dal `claude/project-thread-yuz0lk` @ 8105b3d (thread "Sol menüdeki gizli workspace seçici"). Trenle main'e inince uygulanır.
- `70-hub-kabuk.py`: `_kaynak/tools/sc/70-hub-kabuk.py` yerine geçer (0.1 Sidebar ve 0.4 Workspace switcher metinleri; 0.4'e iki yeni senaryo: `collapsed-open`, `single-open`).
- Sonra: `python3 tools/screens.py`, `build-pages.mjs 0.1 0.4 0.3`, bant, aynı linklere yayın.
- Senaryo kontrolü dalın koduyla koşuldu: 0.1 ve 0.4'ün bütün senaryoları açıldı.

Durum (2026-10-14 00:07 UTC): uygulandı. 0.1, 0.3, 0.4 main 4169aef7'den kuruldu ve aynı linklere yayınlandı (sürüm 5); kaynak _kaynak/'a işlendi.
