# Koordinatör hafızası (devir kopyası)

Bu klasördeki dosyalar, proje koordinatörünün kalıcı hafızasıdır. Her dosyada tek bir bilgi var: bir karar, bir kural, bir thread'in durumu ya da bir püf noktası. `MEMORY.md` dizin dosyasıdır. Önce onu okuyun, diğer dosyalara oradan gidin. Diğer dosyaların başındaki `name`, `description` ve `type` alanları dosyanın ne anlattığını söyler.

Kaynak: `/tmp/claude/memory/team/silo/` (kopyalama tarihi 2026-10-14). Dosyaları yalnız kopyaladım, içeriklerini değiştirmedim. Tek istisna aşağıdaki gizli değer çıkarmasıdır.

## Dosyalar (MEMORY.md + 18 bilgi dosyası = 19 dosya; bu BENIOKU.md hariç)
1. MEMORY.md (dizin)
2. artifact-silme-onayi.md
3. availability-yeniden-kurgu.md
4. bulutta-pgtap.md
5. employees-yorumlari.md
6. git-yetki-devri.md
7. important-dates-drawer.md
8. job-ikon-paketi.md
9. lineup-devir.md
10. lineup-free-themes.md
11. lineup-plan-thread.md
12. mert-calisma-anlasmasi-2026-10-09.md
13. plan-numarasi-kurali.md
14. project-koordinator-modeli.md
15. publish-guard-split-js.md
16. sayfa-atlasi.md
17. vardiya-degisim-plan.md
18. vardiya-karti-kodlama.md
19. varyant-sayfasi-soru-yok.md

## Çıkarılan gizli değerler
- `bulutta-pgtap.md`, 11. ve 12. satırlar: `POSTGRES_PASSWORD` ve `PGPASSWORD` değerleri `[GİZLİ-ÇIKARILDI]` ile değiştirildi. Bu değer, buluttaki geçici test veritabanı konteynerinin şifresiydi. Canlı sistemin şifresi değildi.
- Başka dosyada şifre, token, API anahtarı ya da gizli değer bulunmadı. `RESEND_API_KEY` gibi adlar geçiyor ama değerleri yazılı değil.
