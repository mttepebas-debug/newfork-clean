# AT42 — employee staffing offer response

Gerçek yerel web/API ve Alex çalışan oturumu kullanıldı. Teklif `d2912d10-0a7d-4503-ba0a-dfb75ab01111`, yalnız bu UI doğrulaması için doğrudan DB'ye eklenen sentetik bir `lineup_proposals` kaydıdır. Manager teklif oluşturma/eligibility/final confirmation yolu bu fixture ile doğrulanmış sayılmaz. Kimlikler test workspace'ine aittir; kimlik bilgileri bu dizine kopyalanmadı.

Doğrulanan akış:

1. Shift Hub → My requests: tek teklif satırı, tek underlying ID ve `View in Line Up` bağlantısı.
2. Bağlantı → `/app/employee-hub/lineup?staffing_offer=...`: aynı teklif bir kez görünür; odak ilgili article'a geçer.
3. Tab → Enter ile gerçek `/offers/respond` isteği: teklif DB'de `pending` → `accepted`. Kabul/ret düğmeleri kalkar; sonuç mesajına klavye odağı geçer. Manager onayı beklendiği ve henüz takvime eklenmediği görünür.
4. Kabul öncesi/sonrası workspace published shifts ve shared snapshot hash'leri aynı. Line Up entries de aynı, ancak bu workspace'teki entries kümesi boş olduğundan bu son karşılaştırma kapsamlı Line Up reconciliation kanıtı değildir.
5. Kanıt sonrasında yalnız sahipli sentetik teklif DB'de `cancelled` yapıldı. Aktif, doğrulanamaz bir test teklifi manager kuyruğunda bırakılmadı; devir yapılmadı. Aynı link yeniden açılınca açıklamalı kapalı durum ve çalışan Schedule bağlantısı görüldü. Link gerçek `My Schedule` ekranına ulaştı.

Son görüntüler görüntü aracıyla açılıp incelendi:

- [390 px koyu — kabul/manager bekleniyor](accepted-dark-390.png)
- [320 px açık — kabul/manager bekleniyor](accepted-light-320.png)
- [320 px koyu — kapalı bağlantı](closed-dark-320.png)

`pending-dark-390.png`, kabul öncesi geliştirme görüntüsüdür; sonraki 18 px kartlar arası boşluk düzeltmesinden önce çekildi. Final görsel kabulü olarak kullanılmaz. Ölçümler `measurements.json`; ilgili 390/320 görünümlerinde document ve incelenen kartta yatay taşma yok. Native zoom, gerçek mobil donanım veya insan usability skoru değildir.

DB kanıtı gitignored `supabase/.temp/shift-exchange-staffing-offer-proof.json` altında. Geçici viewport/CDP override temizlendi; görünüm tercihi kaydedilmedi, özgün system/dark tema geri geldi; manager oturumu geri yüklendi. Hosted değişikliği yok.
