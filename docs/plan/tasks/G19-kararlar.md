# G19 — Web'de "bugün": işçi oturumunun kararları

Kullanıcı yokken verilen kararlar (koordinatör talimatı, 2026-09-29). Dal
`task/g19-today-helper` (origin/main'den). BL-277.

1. **Tek yardımcı `apps/web/src/lib/today.ts` → `todayIn(zone?, now?)`.** `lib`
   altında benzeri yoktu; Employee Hub'daki `dateInZone` ve `validZone`
   (`employee-hub/dashboard-model.ts`) oraya taşındı, ikinci bir kopya yazılmadı.
   Kural: lokasyonun saat dilimi biliniyorsa onun takvimi; bilinmiyorsa ya da
   geçersizse cihazın kendi takvimi; asla UTC. Geri alma: bu dalın commit'ini
   geri almak.
2. **Lokasyonu bilen yerler lokasyonun saat dilimini kullanıyor (KK-6'nın web
   yüzü):** Schedule lokasyon başlığındaki yayın uyarısı (her lokasyon kendi
   takvimiyle "haftaya kaç gün") ve Employee Hub izin talebinin "bugün"ü
   (seçilen lokasyon). "All locations – Together" başlığının kendi saat dilimi yok,
   cihaz takvimini kullanıyor.
3. **Lokasyonu henüz bilmeyen yerler cihaz takvimini kullanıyor:** Employee Hub'ın
   ilk tarih aralığı ve Schedule panosunun açılış günü (veri gelmeden soruluyor),
   vardiya değişimi listesinin başlangıcı, imza şablonunun varsayılan geçerlilik
   tarihi, işe alımda doğum tarihinin üst sınırı. Dayanak: auth bağlamında
   workspace saat dilimi yok; kişinin baktığı takvim UTC'den her zaman daha doğru.
   İzin talebinde lokasyon yoksa artık UTC'ye değil cihaza düşüyor.
4. **Kilit:** `lib/today.test.ts` altı dosyada UTC "bugün" kalıbı ya da `?? "UTC"`
   geri gelirse kırmızı olur.
