---
name: kayit-oturumu-yontem
description: Kayıt oturumu (KARARLAR OPS-04) nasıl çalışır; backlog sayımı ve mutabakat yöntemi, program grubu kontrolü, docs-only gönderimde tuzaklar
metadata:
  type: project
---

2026-09-30'dan beri ilerleme kayıtlarını kalıcı bir rol oturumu tutuyor (KARARLAR OPS-04). Güncel pano
`docs/plan/ILERLEME-PLANI.md` §0 (0a durum, 0b açık işler, 0c kullanıcıda bekleyenler); iş sırası
`tasks/BACKLOG-PROGRAM.md`'den. Koordinatör "BESLEME" gönderir, kayıt oturumu ölçer, yazar, docs-only gönderir.

**Backlog sayımı (betikle, elle değil):** `BACKLOG.md`'de `## Kapanan maddeler` başlığının üstünde `- ` ile
başlayan üst düzey satırlar açık, altındakiler kapanandır. Üç ayrı kontrol birbirini tutmalı:
1. satır sayımı (numaralı `^- \*{0,2}BL-\d+` + numarasız);
2. `BACKLOG-PROGRAM.md` Notes zinciri ("açık madde X → Y");
3. `git show <sha>:docs/plan/BACKLOG.md` ile eski commit'lerde aynı sayım.
Numara mutabakatı: en yüksek BL = açık + kapanan + dosyada satırı olmayan numaralar.

**Grup kontrolü:** her açık madde program tablosunda tam bir grupta olmalı. Tablonun "Maddeler" sütununda
parantez içleri kapananlardır; parantezler (iç içe dahil) atılıp kalan `BL-\d+` ve `U\d\d` açık maddelerle
karşılaştırılır. Numarasız maddeler `U01…U66` takma adlarıyla eşlenir (dosyanın sonundaki ek tablo, metnin başı).
2026-09-30'da sayı doğruydu, fark buradaydı: yeni açılan altı madde hiçbir gruba yazılmamıştı.

**Why:** "sayım uyuşmuyor" notu günlerce durdu; sayının kendisi değil gruplama ve Notes zinciri eksikti.
Hangisinin eksik olduğunu yalnız üç kontrol birlikte gösteriyor.

**How to apply:**
- Yeni madde yazılırken grubu da yazılır (madde satırında "Program: Gxx" ve program tablosunda).
- Docs dosyaları çalışma kopyasında CRLF; betikle düzenlerken `newline=""` ile oku, aynı satır sonuyla yaz.
  `sed -i` dosyayı LF'ye çevirir (git normalleştirir, ama diff uyarısı verir).
- Rol hafızası `docs/` dışında: docs-only gönderimle main'e gidemez. Ayrı yerel dala commit edilir
  (`keep/nf-planlama-memory`), sha koordinatöre söylenir.
- İşaretlemede tahmin yok: madde, altındaki tazelik satırları, MVP-PLAN fazı ve ROADMAP okunur; yetmiyorsa
  işaret "belirsiz" yazılır ve nedeni maddenin altına konur.
- Başka bir ajanın aynı anda ölçtüğü grubun madde satırlarına dokunulmaz (2026-09-30, G14).

**Betik:** sayım ve grup kontrolü `backlog_sayim.py` (bu klasörde; repo kökünden `python .claude/agent-memory/nf-planlama/backlog_sayim.py`,
yalnız okur). 2026-09-30 sonu beklenen çıktı: açık 239 (210 + 29), kapanan 225 (187 + 38), en yüksek BL-437, işaretsiz 0,
grupsuz yalnız BL-426.

**İlk oturumun dersleri (2026-09-30, dört besleme):**
- Envanterde dosyaları baştan sona okuma. `BACKLOG-PROGRAM.md` ~65 bin token, G7 satırı tek başına 9 bin karakter; ilk okuma
  bağlamın yarısını yedi. Önce `grep -n "^#"`, sonra `sed -n 'N,Mp' | cut -c1-400`. Asgari okuma listesi
  `docs/plan/ILERLEME-PLANI.md` §0d'de.
- Besleme bir iddiadır, kanıt değil: dört beslemede üç düzeltme çıktı ("bilerek alınmadı" denen commit main'deydi, "~30 dal" 40'tı,
  sorulacak bir karar başka işle zaten düşüyordu). Her sha, CI koşusu ve dal ayrı komutla ölçülür.
- Çok dosyalı düzenleme tek betikle: her çapa `assert` ile tam bir kez bulunur, hepsi geçince yazılır. Yarım uygulanmış kayıt kalmaz.
- Başka ajanın docs commit'i `git cherry-pick` ile alınırken çakışma üç tipte çıktı: komşu satır (onların yeni alt satırı + bizim
  işaretli madde satırımız), aynı tablo satırı (grup satırı: yeni madde bizden, kapsam notu onlardan), Notes'un başı (iki kayıt da
  kalır). Önce yalnız çakışma çözülür ve `cherry-pick --continue`; kendi eklemeler ayrı commit. Karıştıysa son hâlleri scratchpad'e
  kopyala, `git checkout --merge -- <dosya>` ile çakışmayı geri getir, yeniden çöz, sonra kopyaları geri koy.
- İşaretleme: numaralı eski satırlarda biçim `- BL-007 (leave: x / do: y) …`, numarasızda `- (leave: x / do: y) …`; emin
  olunmayan işaret `belirsiz` yazılır, nedeni maddenin altında "İşaret <tarih>" satırında.
- GateGuard kancası: oturumun ilk Bash'i, her yeni dosya (Write) ve yıkıcı görünen her komut (`git checkout --`) önce reddedilir;
  istenen gerçekler yazılıp aynı çağrı yinelenir. Betik dosyasını yeniden kullanmak (üstüne yazmak) yeni reddi önler.
- `git rev-parse --short A B` "Needed a single revision" verir; tek tek çağır. Git Bash'te `rev` yok.
- Worktree geride kaldıysa uygulamanın taban dalıyla eşitleme aracı fast-forward yapar; ağaç temiz olmalı.

**Duzenleme yardimcilari:** `besleme_lib.py` (bu klasorde; 2026-09-30, besleme #9-#11'de yazildi). Besleme betigi scratchpad'de yazilir, repo kokunden kosulur: `sys.path.insert(0, '.claude/agent-memory/nf-planlama')`, `from besleme_lib import Doc, save_all`. Her capa `assert` ile tam bir kez bulunur, hepsi gecince `save_all()` yazar; CRLF korunur. Yardimcilar: `once`, `set_line`, `edit_line`, `after_line`, `before_line`, `append_sub`, `append_end`, `close_entry` (BACKLOG maddesini kapatip sona tasir), `replace_block`, `set_cell`, `add_to_cell`, `append_last_cell`.
