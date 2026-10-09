KARAR: DEĞİŞİKLİK İSTE @2a0e16d6

# FB-6.7 C güvenlik ve kod incelemesi (R3), tur 1
(nf-guvenlik alt ajanı; metni koordinatör yazdı — rolde Write yok)

İncelenen: dal `task/fb-6.7c`, uç `2a0e16d6`, taban `origin/main` (`9d4491ac`). 19 dosya, 4 commit.
Özet: başka workspace'e ya da kapsam dışı lokasyona giden yol yok; yeni servisler çekirdekten soruyor; grant'lar doğru; `seed.sql` temiz. Kritik/Yüksek yok. İki Orta düzelmeden onay yok.

## Orta
- O1. Republish geçmişteki taslak vardiyalardan kişiyi siliyor (K11 ihlali). `20261005000000_closed_days_reach_the_shifts.sql:222-233` (taslak listesi tarihe bakmıyor), `:652-654` (Republish kayıtlı başlangıçtan hesaplıyor). Kanıt: geri alınan denemede 4 yıl önceki taslakta kişili vardiya Republish öncesi 1, sonrası 0; önizleme "düşecek taslak: 1" sayıyor. Düzeltme: taslak listesini `schedule_current_week_start_service`'e bağla + pgTAP satırı.
- O2. "warn" → "confirm_once" çevirisi silen migration'da (`20261005010000_closed_location_loses_warn.sql:6-8`); yeni shared şema "warn"u reddediyor (`availability-assessment.ts:13`; okuyucular `schedule-service.ts:509`, `schedule-data.ts:166`, `organization-settings-service.ts:81,:90`). OPS-03 sırasında kod yayındayken "warn" taşıyan workspace'te Schedule ve Settings → Scheduling 500 verir. Düzeltme: çeviriyi ekleyen migration'a taşı; silen yalnız kısıtı daraltsın. (Koordinatör ölçümü: canlıda 3 workspace'in 3'ü "confirm", "warn" 0 — 2026-10-02 ~11:25Z.)

## Düşük
- D1. Kapalı gün önizlemesi `schedule.read` kapsamıyla süzülmüyor (`:399-411`); yalnız `important_date.write` soruluyor; izin yolu `time_off_impact_seen` ile süzüyor. Düzeltme: `schedule.read` ile süz, gizlenenleri sayı olarak ver.
- D2. Schedule kapanış okuması bütün workspace'leri dolaşıyor (`schedule-service.ts:472-482`; `closure_days` SET search_path yüzünden inline edilmiyor). Bütçe yeşil (17/17). Düzeltme: `.eq("workspace_id", workspaceId)`; migration yorumunu düzelt.
- D3. `recipient_count` çalışana da gidiyor (`:1045-1046`). Öneri: yalnız yönetebilene.
- D4. Test boşlukları: K12 yazar olmayan lokasyon müdürü "Expired"i görür mü; `publish_error_code='not_allowed'` dalı; `important_date.write` olup `schedule.edit` olmayan kişinin vardiya düşüremediği.

## Sorulan noktalar
1. Kapsam: sızıntı yok (müdür workspace geneli / başka workspace → 42501 out_of_scope; çalışan missing_permission; yabancı `keep_shift_ids` yalnız süzgeç; düşürme `authorize('schedule.edit', target_locations)`).
2. Parmak izi: güvenli (eski/boş → 409; arada kişisi değişen vardiya 40001 ile geri alır).
3. İzin yoluyla kural farkı yok (aynı `shift_exchange_reconcile_batch`, takas geçersizleme, kanal); bildirim farkı K14 gereği.
4. Bölme: geçmiş kopya aynı lokasyon/yazar/durum; History'ye yeni yol açmıyor.
5. Duyuru: expired çalışana kapalı; `content_changed_since_acknowledged` yalnız okuyan; hata metni tarayıcıdan okunamıyor; D3.
6. NULL görünürlük: kapalı (coalesce; K12 süre NULL → gösterme).
7. Daraltma: şema + web + kısıt birlikte; sıra O2.
8. seed.sql: sorun yok.
9. Testler kurala göre; gevşetme yok; eksikler D4.

Done when'de açık (bulgu değil): e2e, görsel QA, `closedLocationAsks` ekranda kullanılmıyor (ekran işi).

## Kanıt
db.lock alındı/bırakıldı, CI boştu. Ayrı psql oturumları + rollback: closed_days_reach_the_shifts 41/41, past_dates_and_ended_announcements 46/46, announcements_and_dates_edge_cases 64/64, authorization_coverage 5/5, retired_objects_stay_gone 19/19, schedule_grid_read_budget 17/17. Denemeler P1–P5 (O1 kanıtı, out_of_scope ×2, missing_permission, yabancı keep). vitest: API important-dates-routes 17/17, shared 6/6, web 15/15.

## Yolda bulunanlar (backlog)
- Önizleme saat dilimi: başlangıç lokasyonun diliyle (`shift_exchange_shift`), süzgeç vardiyanın kendi diliyle; farklı dilde saat kayabilir.
- Arşivden dönen lokasyon: kapalı gün o lokasyonun vardiyalarına listesiz uygulanıyor (K13 sorusu yok).
- Değişmeyen kayıt geçmiş tarihte de sürüm numarasını artırıyor.

Tekrar inceleme: O1+O2 düzelince yalnız fark (`2a0e16d6..yeni uç`) + O1 pgTAP satırı.
