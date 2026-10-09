# Kayıt oturumu — ilk iş raporu (2026-09-30)

Oturum: "Rol: nf-planlama (Kayıt ve ilerleme)". Taban `origin/main` `bccdb4df`; gönderilen commit `81fd0dd3` (yalnız `docs/plan`, 8 dosya; `main.lock` ile, fast-forward).

## A. Envanter (ölçüm 2026-09-30, `bccdb4df`; "son güncelleme" = `git log -1 -- <dosya>`)

| Dosya | Son anlamlı güncelleme | Bayat kalan yer | Bu turda |
|---|---|---|---|
| `BACKLOG.md` | `462635a6` (BL-434…BL-436) | Sayı doğru (239). BL-433…BL-436'da program grubu yoktu. 53 açık maddede iki işaret yok | Dört maddeye grup satırı. İşaretleme yapılmadı |
| `DONE.md` | `8ad616c7` (FB-6.2 `.8`) | `.10` satırı yoktu | `.10` satırı eklendi |
| `HANDOFF.md` | `169ec0a9` (devir, sabah) | §2 Save dalını "sürüyor", `.10`'u "başlat" diye anlatıyor; §5.7 "sayım uyuşmuyor" diyor. Koordinatörün dosyası | Dokunulmadı |
| `ILERLEME-PLANI.md` | `23f734bf` (2026-09-29 sabah) | Sıra hesabı (§4) ve FB-6.2 satırları bir gün gerideydi: `.1`–`.10` "bekliyor" görünüyordu; §9 "FB-6.2.1 park" diyordu | Yeni §0 (güncel durum); §1 yüzdeler, §3 FB-6.2 satırları; §4 ve §9'a "geçersiz" notu |
| `KARARLAR.md` | `48a9d139` (`.8` ekran kararları) | EMP-001 kararları bilerek yazılmamış (EMP-001 "KARARLAR'da değişecek satırlar": dilim main'e girerken) | OPS-04 eklendi; Employees bölümüne dokunulmadı |
| `KOORDINATOR-KARARLARI.md` | `52b349ef` (KK-35 düzeltmesi) | Güncel (KK-1…KK-37; kullanıcı döndü, yeni KK yok). KK-29, KK-33, KK-35 EMP-001 B ile geçersiz olacak | Dokunulmadı |
| `MVP-PLAN.md` | `51864d30` (2026-09-27) | FOUNDATION-B'den ve FB-6.2'den hiç söz etmiyor (faz planı; repo taraması 2026-09-16: "281 migration", bugün 397). FB-6.2'nin durumunu yansıtmıyor, yansıtması da beklenmiyor: durum ROADMAP'te | Dokunulmadı |
| `ROADMAP.md` | `a656760f` (2026-09-28) | Son durum satırı "sırada FB-6.2.1" diyordu | "Durum 2026-09-30" satırı eklendi |
| `tasks/BACKLOG-PROGRAM.md` | `8ad616c7` (`.8`) | G7 satırı "Sırada `.10`", Save dalı "sürüyor"; EMP-001 yok; "Sayım" başlığı 290'da; dal listesi 22; üç commit'in Notes satırı yok | Hepsi güncellendi |
| `tasks/FOUNDATION-B.md` | `e4b5be3f` (FB-6.6 notu) | Notes'ta FB-6.2'nin main'e giren hiçbir adımı yoktu (son kayıt BL-218.3) | Notes'a FB-6.2 `.0b`–`.10` ve yüzde |
| `tasks/FB-6.2.md` | `bccdb4df` (`.10` main CI) | Notes güncel; Status satırı "ready (2026-09-27)" | Status "active" |
| `tasks/EMP-001.md` | `4d4769fd` (bugün) | Güncel | Dokunulmadı |

**ILERLEME-PLANI mı, BACKLOG-PROGRAM mı:** iş sırası 2026-09-29'dan beri `BACKLOG-PROGRAM.md`'den geliyor (kullanıcı kararı; ILERLEME §9 ona bağlıyor). ILERLEME'nin FOUNDATION-B puan tablosu o günden beri yeniden hesaplanmamıştı. CLAUDE.md §11.6 hâlâ "ILERLEME-PLANI sırası" diyor. Önerim ve yaptığım: ILERLEME-PLANI güncel pano olur (§0), sıra için BACKLOG-PROGRAM'a bağlar; böylece §11.6 değişmeden doğru kalır, ikinci dosya açılmaz.

## B. Backlog mutabakatı (betik, 2026-09-30, `bccdb4df`)
- Açık **239** (numaralı 210, numarasız 29). Kapanan bölümde 224 (186 + 38). En yüksek BL-436.
- Açık sayı doğru: 233 (`8ad616c7`) + BL-431…BL-436 = 239. Üç bağımsız yoldan aynı: satır sayımı, Notes zinciri, `git show <sha>:BACKLOG.md` ile eski sayımlar (286 → 233 → 236 → 239).
- Numara: 436 = 210 + 186 + 40 (dosyada satırı olmayan; hepsi BL-090 altı, 16'sı tek satırda toplu, 10'u DONE.md'de, 14'ünün yeri ölçülmedi).
- Satır: 362 (`3a31d625`) − 3 çift + 106 yeni − 2 yeniden numaralanan = 463 = 239 + 224.
- **Fark neredeydi:** gruplamada. BL-431…BL-436 hiçbir grupta değildi (program tablosu 232 sayıyordu). Düzeltildi: 238 grupta + BL-426 bilerek grupsuz.
- Notes zincirinde satırı olmayan üç commit yazıldı (`52b349ef`, `b406ca9e`, `462635a6`).
- Kayıt yeri: `BACKLOG-PROGRAM.md` "Sayım" bölümünün ilk maddesi.

## C. Kural kaydı
`KARARLAR.md` OPS-04 (tabloda OPS-03'ün altı).

## D. Üç hazır liste
`ILERLEME-PLANI.md` §0: 0a durum (5 satır), 0b açık işler (24 satır, toplam 239), 0c kullanıcıda bekleyenler (16 satır + dal silme komutu).

## Uyuşmazlıklar ve açık noktalar
1. **`81ebc4b8`:** beslemede "bilerek alınmadı" deniyor; aynı başlık ve aynı iki dosya (`ci-green.txt`, `ci-not-green.txt`, 14+/14−) main'de `644b06d9` olarak var. Dal silinebilir; ifade kayıtta "içerik main'de" diye duruyor.
2. **Dal sayısı:** beslemede "~30"; ölçüm 40 (36'sında "+" 0; 4'ünde içerik başka sha ile main'de). `task/emp-001-a` uzakta yok, yalnız yerelde.
3. **KK-29 sorusu:** EMP-001 B "yalnız yönetir"i sökünce düşer; kullanıcıya sormadan önce bu söylenebilir.
4. **İşaret borcu:** 53 açık maddede iki işaret yok (GY 24, G24 9, GS 6 …). İstersen ayrı kayıt işi olarak yaparım.
5. **Rol hafızası:** `.claude/agent-memory/nf-planlama/` `docs/` dışında; docs-only gönderimle gidemez. Sayım yöntemi bu yüzden `BACKLOG-PROGRAM.md` "Sayım"a yazıldı. Hafıza notu gerekiyorsa gönderimi sen yaparsın.
6. **Yüzde:** %53,9, ILERLEME §3'teki FB-6.2 satırlarının puanından (38) hesaplandı; dilimin kapanış kriterleri yeniden ölçülmedi (`.11`'in işi).
7. **Skill:** `superpowers:verification-before-completion` çağrılmadı; her satır komutla ölçüldü (yukarıdaki kanıtlar).
