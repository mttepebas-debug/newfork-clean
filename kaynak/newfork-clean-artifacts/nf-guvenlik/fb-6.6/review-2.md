KARAR: DEĞİŞİKLİK İSTE

# FB-6.6 A1 + A2 — güvenlik ve kod incelemesi, tur 2 (yalnız fark)

İncelenen: `task/fb-6.6-a2` @ `a6dd4897`; fark `85267a22..a6dd4897` (6 dosya). Onaylı iki migration değişmemiş (diff'te yalnız yeni
`20261006020000_hidden_rows_count_for_nobody.sql` var). A2'nin yeniden yazılan commit'leri aynı yama; yeni olan `a6dd4897` (Settings → Documents rotaları)
ve A1'in `80dca0f7`, `3c891ee7` commit'leri. Başkasının worktree'sine dokunulmadı.

## Özet (kod okumayan için)
- Orta 1, Düşük 0 (yeni); tur 1'in Düşük 2, 3, 4 bulguları ve yorum önerisi düzeldi, testli. Tur 1'in Düşük 1'i (owner yüklemesinde API / DB işaret farkı) bu turun konusu değildi, açık kalıyor.
- Durdurma nedeni tek: **bekleyen yenileme bir kez değiştirilince eski (hiç incelenmemiş) yükleme, karar veremeyen müdüre açılıyor**. Mert'in S2 kuralı
  ("bekleyen yükleme, dosyası, indirmesi ve geçmişi yalnız karar verenin ve sahibinin") tam bu turda yazılan yoldan deliniyor. Düzeltme küçük.

## Bulgular

### Orta
1. **Değiştirilen bekleyen yükleme (superseded) karar veremeyene görünüyor ve indirilebiliyor** —
   `20261006020000_hidden_rows_count_for_nobody.sql`: `get_employee_document_lifecycle_service` gönderim listesi (`s.state<>'pending_review' or …`),
   geçmiş süzgeci (yalnız `pending_review` gönderime bağlı olayları saklıyor), `get_employee_document_lifecycle_path_service` (`s.state<>'pending_review' or …`).
   Neden: `submit_employee_document_lifecycle_service` (`20261006000000…:1818`) bekleyen gönderimi yenisi gelince `superseded` yapıyor; bu, gönderimi
   `superseded`'e çeviren tek yol, yani `superseded` = "incelemeye düşmüş ama hiç incelenmemiş yükleme". Süzgeçler yalnız `pending_review`'u saklıyor.
   Somut senaryo (kanıtlandı, aşağıda): Deniz'in Food Handler'ı onaylı. Deniz yenisini yükler (bekliyor), sonra yanlış dosyayı düzeltmek için bir kez daha yükler.
   İlk yenileme `superseded` olur. Kadıköy'deki eş müdür Ayşe Employees → Deniz → Documents'ta o ilk yenilemeyi sürüm listesinde görür, dosyasını indirir,
   geçmişte gönderim olayını görür — Deniz'in yeni dosyası hâlâ admin Zeynep'in kararını beklerken.
   Tur 1'de bu yol yoktu (onaylısı olsun olmasın bekleyen satır bütünüyle gizliydi); `3c891ee7` onaylı belgeyi görünür bırakırken açtı.
   Beklenen: karar veremeyen okuyucu `pending_review` gibi `superseded` gönderimi de, dosyasını ve ona bağlı geçmiş olaylarını görmez (hiç incelenmemiş yükleme
   karar verenin ve sahibinindir; satırın kararı verilince de görünmez — bu, S2 kuralının doğal okuması; aksi isteniyorsa Mert'e sorulur).
   Öneri: üç süzgeçte `s.state<>'pending_review'` yerine `s.state not in ('pending_review','superseded')` (ya da tek bir `app_private` yardımcısı:
   "bu gönderim bu okuyucuya görünür mü", üç yerde aynı kural) ve geçmiş süzgecinde aynı durum listesi; aşağıdaki üç denemenin pgTAP hücresi olarak
   `documents_on_the_core.test.sql`'e girmesi (olumsuz: Ayşe görmez / indiremez / geçmişte yok; olumlu: Zeynep ve Deniz görür).
   Yeni migration ile (onaylı migration değişmez). Düzelten: `nf-db`.

## Görev mesajındaki sorular
1. Yeni migration: `document_sees_pending` ve `document_view` `security definer`, `search_path = ''`, ikisinde de
   `revoke all … from public, anon, authenticated`; `document_row_readable` `create or replace` (tur 1'deki revoke korunuyor). `document_view`
   karar veremeyene satırın `submitted_document_id`'sini, `paused_remaining_seconds`'ını ve `awaiting_review` durumunu siliyor; `document_obligation_json`
   "pending_review" bilgisini yalnız `submitted_document_id`'den okuduğu için liste ve tekil özet temiz. Onaylı sürümü olmayan bekleyen belge bütünüyle gizli
   (`document_row_readable`: `approved_document_id is not null or …`). Bildirim (yalnız karar verene), hesap sayacı (yalnız kendi) değişmedi.
   **Sızan tek yol bulgu 1.**
2. #3 doğru: onboarding incelemesi görülemeyen satırı ne listeliyor ne sayıyor; durum `document_view` üzerinden. Testli (Lale hücreleri: görmez, Ayşe görür,
   `progress_total` bir eksik). #4 doğru: kendi onboarding okuması yetkiyi okuduğu vakanın workspace'ine soruyor (`by_case = true`); vakası hiç olmayan kişi
   ilk üyeliğe düşüp vakasını açabiliyor (ilk giriş bozulmuyor). Testli (askıya alınmış workspace'teki açık vaka öteki workspace üzerinden okunamıyor).
3. #2 doğru: `document-types-routes.ts`'teki 6 uç `resolveActor` ile kim olduğunu çözüp DB servisine `actor_user_id` ile gidiyor; hedef servislerin altısı da
   ilk ifadede `app_private.authorize(…, 'settings.documents.write')` soruyor (`preview_document_publication_service`, `set_document_publication_service`,
   `document_definition_target_options_service`, `save_document_type_draft_service` → `save_document_type_lifecycle_service`, `set_document_type_archived_service`,
   `reorder_document_types_service`); service role ile çekirdeği atlayan çağrı yok. Hata `rpcFailure` ile; testte core'un "hayır"ı 403 + neden, workspace uyuşmazlığı 404.
   Onboarding yorumu düzeldi.
4. Tur 1 ONAY'ını bozan başka bir şey yok: onaylı iki migration aynı, A2 yamaları aynı.

## Kanıt
- `git diff 85267a22 a6dd4897` (6 dosya) okundu; yeni migration'ın tamamı okundu.
- Yerel DB, CI boşken (`gh run list --limit 3`), `node scripts/lock.mjs take/release db` ile; tek psql oturumunda `begin;` + üç migration +
  `documents_on_the_core.test.sql`'in "and its upload" hücresine kadarki kısmı + benim 5 deneme hücrem + `rollback;`:
  - dosyanın kendi 20 hücresi geçti (S2 yenileme hücreleri dahil);
  - deneme 21–22 geçti: ilk yenileme `superseded`, `reviewed_at` boş (hiç incelenmemiş);
  - **deneme 23 düştü**: Ayşe'nin tekil okumasında o gönderim var;
  - **deneme 24 düştü**: Ayşe o gönderimin dosyasının yolunu alıyor (`have: ok`, `want: P0002`) — indirme açık;
  - **deneme 25 düştü**: Ayşe'nin geçmişinde o gönderimin olayı var.
- `pg_proc.prosrc` taraması: gönderimi `superseded` yapan tek fonksiyon `submit_employee_document_lifecycle_service` (yalnız `pending_review`'dan).
