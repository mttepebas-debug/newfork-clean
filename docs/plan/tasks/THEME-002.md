# THEME-002 Light temayı sıkılaştır: token seti ve tutarlılık
Status: done
Session: TEST-001 session (local_24e92640, Opus 5 medium)   Branch: task/theme-002   Worktree: newfork-wt/theme-002   DB: yok
Öneri: Opus 5, medium. Görsel tutarlılık ve kontrast değerlendirmesi gerekiyor; redesign yok.

Goal: Light tema tek bir semantik token setinden beslensin. Yeni UI sabit renk yazmak zorunda kalmasın. Bilinen light sorunları kapatılsın.

Karar (kullanıcı, 2026-09-16): light tema sorunları çözülecek ve tema sıkılaştırılacak.

Bilinen sorunlar:
- `--theme-*` semantik token'ları yalnızca dark için tanımlıydı. Light UI sabit hex fallback'leri kullanıyor (ör. export-v2.css, export-variants.css).
- Topbar filtre çipleri Settings dropdown'ının üstünde render ediliyor (z-index; BACKLOG).
- Topbar ~936px genişlikte iki satıra sarıyor (BACKLOG, polish).

In scope:
1. **Audit (kod yazmadan önce):**
   - Mevcut light paletini çıkar: styles.css'teki sabit renklerin kullanım sıklığı ve mevcut `:root` değişkenleri (`--schedule-action` vb.).
   - Tekrar eden değerleri ~15–25 semantik token'a eşle: page, surface, soft, text, muted, border, accent, selected, danger, warning, success, focus.
   - Eşleme tablosunu rapora yaz ve koordinatör onayı olmadan uygulamaya geçme.
2. **Uygulama:**
   - `:root` altında light `--theme-*` seti tanımlanır.
   - Önce son eklenen ve fallback kullanan dosyalar token'a geçirilir (export, documents, schedule topbar filter, employee schedule board).
   - Ardından styles.css'teki en sık tekrar eden sabitler token'a geçirilir.
   - Görsel sonuç değişmez. Değişen renk varsa listelenir.
3. **Düzeltmeler:**
   - Topbar filtre ve Settings dropdown z-index'i.
   - Ana sayfalarda metin/arka plan kontrastı WCAG AA (Schedule, Employees, Settings, Account, Employee Hub, Announcements, Requests). Düşük kontrast bulunan yerler düzeltilir.
4. **KARARLAR UI-05:** yeni token sözleşmesi için önerilen metin rapora yazılır.

- Kullanılmayan `account-theme-*` kuralları silinir.

Out of scope:
- Yeni tasarım dili, renk paletinin değiştirilmesi, layout değişiklikleri.
- Dark tema.
- Topbar'ın iki satıra sarması (ayrı polish maddesi olarak kalır).

Done when:
- Light token seti `:root`'ta tanımlı.
- Fallback kullanan son dosyalar token kullanıyor.
- Z-index bug'ı kapalı.
- Kontrast bulguları düzeltilmiş ya da gerekçesiyle listelenmiş.
- 7 sayfada önce/sonra görsel karşılaştırmasında istenmeyen fark yok.
- Web typecheck, ilgili testler ve build PASS.

Touches: `apps/web/src/styles.css`, ilgili sayfa css'leri, `schedule/components/*topbar*`.

Test plan: CSS ağırlıklı iş olduğu için test yok. Sonda typecheck ve build bir kez; görsel karşılaştırma zorunlu.

Risk: toplu renk değişimi istemeden görünümü kaydırabilir. Değişiklikler küçük commit'lerle yapılır ve her grup ayrı karşılaştırılır.

## Notes / Result
- 2026-09-16 audit onaylandı (kullanıcı):
  - 22 `--theme-*` token'ı: page, surface, surface-soft, surface-muted, text, text-body, muted, border, border-subtle, border-strong, accent, accent-strong, selected, focus, action, action-hover, danger(+soft), warning(+soft), success(+soft), current. `--schedule-*` değişkenleri bu token'lara alias olur.
  - Yalnızca birebir hex eşleşmeleri çevrilir.
  - Bilinçli tek değişiklik: documents.css'te tanımsız `--theme-muted/text` bug'ının düzeltilmesi.
  - Audit bulgusu: CSS'te 1250 farklı hex ve 2815 kullanım var.
- 2026-09-16 main 6f677a0:
  - 23 `--theme-*` token'ı eklendi; `--schedule-*` bu token'lara alias.
  - 420 birebir hex, token'a çevrildi.
  - account-theme-* kuralları silindi.
  - Topbar panellerine z-index:105 verildi.
  - Kontrast (b): muted #66716c; 7 seçici token'a bağlandı; 7 sayfada AA ihlali 0.
- Kanıt: postcss eşdeğerliği; 4031 elemanda hesaplanmış stil farkı 0 (1–4. adımlar); typecheck ve build PASS; 80 test PASS.
- Kalanlar (backlog):
  - THEME-003 yakın tonlar.
  - Sayfa CSS'leri (lineup, account…) henüz token'a geçmedi.
  - Beyaz metin için token yok (on-accent).
  - Gerçek Employee Hub, çalışan hesabıyla ölçülmedi.
