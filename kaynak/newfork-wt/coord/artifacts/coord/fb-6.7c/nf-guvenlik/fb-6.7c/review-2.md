KARAR: ONAY @22d58021

# FB-6.7 C güvenlik incelemesi (R3), tur 2 — yalnız fark `2a0e16d6..22d58021`
(nf-guvenlik alt ajanı; metni koordinatör yazdı)

Tur 1'in O1, O2, D1–D4 bulguları kapandı. Yeni Kritik/Yüksek/Orta yok.
- O1: etki hesabı düzenlenebilir haftadan (`20261005000000…sql:200`); önizleme/kayıt/Republish aynı yol. #34/#35 eski migration'la kırmızı, yeniyle yeşil.
- O2: çeviri ekleyen migration'da, `confirm_once`'ı kabul eden kısıttan hemen sonra (`:1115-1119`). Deneme: warn→ ekleyen sonrası warn 0 / confirm_once 1; kaldıran hatasız.
- D1: önizleme `schedule.read` kapsamıyla süzülüyor (`:421-430`), görülemeyen `hidden_shift_count`.
- D2: `.eq("workspace_id")` + vitest; yorum düzeldi.
- D3: `recipient_count` yalnız değiştirebilene; Emre görmüyor.
- D4: üç test eklendi.

Koordinatörün soruları:
(a) Göremediği vardiyayı düşürebilir mi? Hayır. Düşürmek `schedule.edit` ister; `schedule.manage` `schedule.read` olmadan verilemez (`enforce_role_permission_dependencies`). Göremeyen kişi orada düşüremez, kaydı 403 (güvenli yönde). Dina testi 403, Ali'nin vardiyası yerinde. `scope_set` boşta `{}` döner (NULL değil).
`hidden_shift_count` sızıntı mı? Kabul edilebilir: yalnız kişinin önemli tarih yazabildiği lokasyonlar için; ad/saat/lokasyon adı yok; izin yolundaki `time_off_impact_seen` ile aynı.
(b) O2 kendi kısıtıyla çakışmıyor (deneme yukarıda).

Düşük (onayı engellemez): "warn" çevirisini kaldıran migration'da (`20261005010000`) da tut; ekleyen canlıdayken eski ekran bir workspace'i yeniden "warn" yaparsa kaldıran kısıt hatasıyla durur. Satır idempotent.

Kanıt: gh run list boş, db.lock alındı/bırakıldı, ayrı psql + rollback. `closed_days_reach_the_shifts` 47/47, `past_dates_and_ended_announcements` 50/50; yeni test eski migration'la 43 geçti, 4 kırmızı (#5, #6 D1; #34, #35 O1). vitest API 41/41.

İncelemecinin hatası: işçinin worktree'sinde `git checkout --detach 22d58021` koştu, hemen `git checkout task/fb-6.7c` ile geri aldı. Koordinatör ölçtü: dal `task/fb-6.7c`, uç `22d58021`, temiz.
