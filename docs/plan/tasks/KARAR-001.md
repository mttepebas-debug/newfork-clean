# KARAR-001 Karar uyumu: Opus'un Newfork'u Mert gibi düşünmesi
Status: in progress
Session: kullanıcının tekil oturumu (2026-09-30)   Branch: task/karar-001   Worktree: newfork-wt/karar-001   DB: -

Goal: Sorulardaki "(Önerilen)" seçenek Mert'in istediğini daha sık bulsun. Kapsanan kararlar sorulmadan,
dayanağıyla verilsin. Mert'in seçenek dışı her cevabı kurala dönüşsün. Ölçüm (2026-09-30, eski oturum
kayıtları): öneri kabulü %68 (420/617 tek seçimli önerili soru); hedef en az %85.

In scope:
- `docs/plan/ILKELER.md`: vizyon, ödünleşim sırası, 25 karar ilkesi (koşul ve kanıtla), Claude'un
  yanlış eğilimleri. CLAUDE.md'den her oturuma yüklenir.
- CLAUDE.md §13: özerklik konuya göre, soru şablonu, dayanak satırı, cevabın kurala dönmesi, ölçüm.
- `scripts/decision-log.mjs` ve testi:
  - Dayanaksız ya da farklı etiketli öneri Mert'e ulaşmaz.
  - Her cevap `.newfork-inbox/decisions.jsonl`'a yazılır.
  - Serbest cevapta Claude'a not düşer.
  - `stats` ve `backfill` komutları.
- KOORDINATOR-KARARLARI'nın dayanak sırası ve "Mert:" durum satırı. KK-43, KK-51, KK-57 ve KK-65
  işaretli.
- KARARLAR'ın kaynak okuma kuralı ve yeni madde biçimi (Neden, Reddedilen).
- `nf-arayuz`: workspace/team çelişkisi düzeltildi, "önce dinle" adımı eklendi. `nf-planlama`: haftalık
  günlük taraması.
- Mülakat (Mert): taslak ILKELER'in düzeltilmesi, vizyon boşlukları, 24 kural adayının onayı, karşı
  örnekli ilkeler.
- Geriye dönük test: ilkeler yalnız 26 Eylül ve öncesinden çıkarılır, 27-30 Eylül'deki sorularda denenir.

Out of scope:
- Kod yazma hattının hızlanması (sonraki iş).
- Global `~/.claude/CLAUDE.md`.
- BL-501, BL-502.
- Ürün kodu.

Done when:
1. ILKELER.md main'de ve her oturum onu yüklüyor. Her ilkede koşul, kanıt ve Mert'in onay tarihi var.
2. 24 kural adayının her birinde Mert'in kararı kayıtlı (girdi / düzeltildi / reddedildi).
3. Hook bağlı ve çalışıyor:
   - Dayanaksız öneri Mert'e ulaşmıyor.
   - Her cevap günlükte.
   - Serbest cevap aynı oturumda kural adayı oluyor.
   - `pnpm.cmd test` yeşil.
4. Geriye dönük test raporu yazıldı: ilkeli tahmin ile ilkesiz tahmin karşılaştırıldı.
5. İleriye dönük hedef: sonraki 60 önerili soruda kabul en az %85; "açıkla / koordinat ver" geri dönüşü
   en fazla 2.

Touches:
- `docs/plan/**` (ILKELER, KARARLAR, KOORDINATOR-KARARLARI, BACKLOG, research, tasks).
- `CLAUDE.md`, `.claude/agents/nf-arayuz.md`, `.claude/agents/nf-planlama.md` (plan onayıyla).
- `scripts/decision-log*.mjs`, `package.json`.
- `.claude/settings.json`: hook bağlantısı, kullanıcı ekler (aşağıdaki not).

Test plan:
- `node --test scripts/decision-log.test.mjs`.
- stdin üzerinden uçtan uca deneme.
- Geçmiş verilerle `stats`.
- Mert'in ilk sorusunda canlı deneme.

Risk: R2 (ortak araç; yetki ve veri yok). Hook kendi hatasında soruyu geçirir. Kapatma:
settings.json'daki iki satır silinir.

Reviewer: bir bağımsız `/code-review` (hook betiği).

## Notes / Result
- 2026-09-30 araştırma: `docs/plan/research/KARAR-001-analiz.md`.
  - 409 cevap sınıflandı; 25 ilke çıktı, iki şüpheci karşı örnekle sınadı.
  - Kök nedenler: soru tasarımı ~%25, yazılmamış bilgi ~%24, Claude'un varsayılanları ~%22,
    yazılı ama bakılmamış ~%12, yeni karar ~%8.
- 2026-09-30 başlangıç çizgisi (`node scripts/decision-log.mjs stats`, `backfill` sonrası): 423/622
  önerili tek seçimli soruda öneri seçildi (%68). Haftalık: 09-14 %56, 09-21 %64, 09-28 %74.
- 2026-09-30 hook bağlantısı: otomatik mod sınıflandırıcısı `.claude/settings.json`'a hook eklemeyi
  "ajanın kendi araç ayarını değiştirmesi" diye reddetti. Bağlantıyı Mert ekler; metin raporda ve
  aşağıda.

```json
"PreToolUse":  { "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/decision-log.mjs\" hook pre",  "timeout": 15 }] }
"PostToolUse": { "matcher": "AskUserQuestion", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/decision-log.mjs\" hook post", "timeout": 15 }] }
```
- 2026-10-01 mülakat 1. tur: müşteri 2-5 lokasyon / 20-100 kişi; "hepsi eşit önemde, MVP önceliği müdür ve owner, sonra aynı kalitede employee arayüzü ve app" (serbest cevap; ILKELER A'ya yazıldı); müdür masaüstü / çalışan telefon; rakip yalnız referans.
- 2026-10-01 geriye dönük test: ilkesiz %70,6, ilkeli %68,6, o günkü öneri %71,8 (255 soru). Ayrıntı: research dosyası "Geriye dönük test". Hedef %85'in yolu serbest cevapları azaltmak (doğru seçeneğin listede olması), seçimi iyileştirmek değil.
- 2026-10-01 bağımsız inceleme (`feature-dev:code-reviewer`): 3 önemli bulgu düzeltildi:
  - "[No preference]" serbest cevap sayılıyordu.
  - "(not recommended)" / "(önerilmez)" öneri sanılıyordu.
  - Tek bozuk günlük satırı okumayı boşaltıp geçmiş yüklemesini ikiletiyordu.

  Dört küçük bulgu da düzeltildi: kayıt hatasında geri çevirme kaybolmuyor; boş "Dayanak:" geçmiyor; "(ÖNERİLEN)" yakalanıyor; toplam satırı ne saydığını söylüyor. Kalan: hafta sınırı UTC (en çok 3 saat kayma). Yeni 3 test eski kodda kırmızı, yenide yeşil (14/14).
- 2026-10-01 günlük yeniden kuruldu: yedek `.newfork-inbox/decisions.backup-2026-10-01.jsonl` (804 satır, eski sınıflama). Yeni dosya 819 satır. KARAR-001 öncesi başlangıç çizgisi 420/617 = %68,1. Bu oturumdaki şablonlu mülakat sorularında 14/15, ama küçük ve kolay örnek; kanıt sayılmaz.
