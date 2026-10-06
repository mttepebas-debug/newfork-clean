# EKRAN-02 V — görsel varyantlar (Requests) — uygulama arşivi

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| 02 Requests | V — G1, G2, G3, G4 (teyit), S7 | `nf-arayuz` / arayüz hattı (dal `task/var-ekran-12`, `0d46e1c5` + `610bd330`) | R0 | yok (R0; main'e girmez, Mert seçer) | 2026-10-06 |

## Sonrası için
- Tuzak: Requests → Shift changes varsayılan tarih aralığı bugün + 42 gün; e2e dünyasının vakaları 2028'de, görmek için adrese `from=2028-10-01&to=2028-10-31&case=<id>` gerekir (API en çok 62 gün kabul eder).
- Tuzak: Requests'in arama ve açılır listesi ortak `--theme-border-control` yerine kendi `#e1e7e3`'ünü çiziyor (1,25:1); S7 seçimi C3'te bu iki yeri birlikte değiştirmeli.
- Kalıp: G1 için K-S2 ile aynı görünüm (kapalı düğme + tek satır neden) tutarlılık sağlar.
- Ölçüm: `#7f8c86` sayfa zemininde (`#f4f5f3`) 3,2:1, beyazda 3,5:1; bugünkü `#aeb9b4` 1,84:1.

## Rapor
Tek rapor iki ekranı birlikte anlatıyor: `docs/plan/ekranlar/01-schedule/uygulama/VAR.md` → "## Rapor" (Requests kısmı "### EKRAN-02 Requests" başlığında).
