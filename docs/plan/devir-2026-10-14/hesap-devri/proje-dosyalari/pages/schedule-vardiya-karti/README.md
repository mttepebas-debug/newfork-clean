# Vardiya kartı, sürükleme ve hayalet vardiya varyantları

Mert'in 2026-10-09 Schedule listesinden madde 3, 4 ve 10. Thread: "Vardiya kartı, hayalet vardiya ve sürükleme".
Temel: Schedule test sayfası (`/mnt/project-files/pages/schedule-test/`) ve main `9a9793e2` (2. tur; 1. tur `df17fd67`). O klasöre dokunulmadı; burası ayrı kopya.

- Yayın: https://claude.ai/artifact/2oRzMjRe1hRRgYhDzRyxJE (yeni sürümler aynı bağlantıya)
- Yayınlanan dosya: `index.html` (tek dosya, ~8 MB)
- Kaynak: `source/` — repo'da `apps/web/.temp/vk/` altına kopyalanır (`.temp/` gitignore'da)
- Seçimler: `KARARLAR-NOTU.md` (madde 3 → 6, madde 4 → B; madde 10 açık).
- Ghost 2. tur (Mert 08:21Z): 11–20 yeni, 5a–5e (5'in türevleri, 5c kırmızı). 19, 20 ve 5e yalnız o kişinin satırında çalışırken değişir.
- Varyant seçimi: sağ alttaki "Test page" düğmesi. Her maddede "Original" bugünkü main.

## Ne değişti (test sayfasına göre)
- `source/overrides/ShiftCard.tsx`, `source/overrides/ScheduleGrid.tsx`: gerçek dosyaların kopyası + varyantlar. `vite.config.ts`'teki `vk-overrides` eklentisi uygulamanın bu iki dosyasını bunlarla değiştirir; geri kalan her dosya main'in kendisi.
- `source/vk/store.ts`: seçimler (tarayıcıda kalır, `<html data-vk-*>`'a yazılır). `source/vk/vk.css`: varyant stilleri.
- `source/harness.ts`: "Test page" menüsü üç madde için; ghost varyant 10'un "üzerinde çalıştığın kişi" kuralı da burada.
- `source/mock/world.ts`: Priya Pazartesi öğle vardiyası (not + "!" + tik birlikte), Aisha Cuma akşam ("!"), dört vardiyada yönetici notu. Kayıt anahtarı `newfork.scheduleVK.world.v1`.
- Templates penceresi bu sayfada main'deki gibi (varyantları öteki sayfada).

## Yeniden derlemek (bulut thread'i, Linux)
1. `source/` içeriğini `apps/web/.temp/vk/` altına kopyala (`pnpm install` yapılmış olmalı).
2. `apps/web` içinde: `./node_modules/.bin/vite build --config .temp/vk/vite.config.ts`
3. `node .temp/vk/inline.mjs /mnt/project-files/pages/schedule-vardiya-karti/index.html`
4. Aynı Artifact bağlantısına yeniden yayınla.

## Gerçeğe geçerken bilinmesi gereken
- Madde 4: satırlar sürükleme başladıktan sonra gizlenir; fare kıpırdamadan bırakılırsa hedef, gizlenmeden önceki yerleşime göre hesaplanmış olabilir. Gerçek işte hedef, satırlar gizlendikten sonra yeniden hesaplanmalı.
- Madde 10: animasyonlar "hareketi azalt" ayarında durur.
