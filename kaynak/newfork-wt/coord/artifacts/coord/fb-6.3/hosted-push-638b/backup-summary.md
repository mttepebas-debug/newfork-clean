# Hosted push FB-6.3.8b — yedek (2026-10-01)
- Proje: hvyvyisrqyathtliyyyv
- Gönderilen: 20261003041000_time_off_one_notice_per_pass.sql (56c03295, ONAY @56c03295)
- Öncesi son migration: 20261003040000; 20261003041000 yoktu.
- Öncesi md5(prosrc) app_private.time_off_sweep: 03cd9dfce6ba07bb935ac36ce2723f9f (= 20261003033000 gövdesi)
- Grant: {postgres=X/postgres} (grants.txt)
- Geri dönüş: time_off_sweep.functiondef.sql dosyasını hosted'da çalıştır (yeni migration ile).
- Advisors security ÖNCESİ: 98 bulgu (96 INFO rls_enabled_no_policy, 1 WARN extension_in_public pg_net, 1 WARN auth_leaked_password_protection)
- Not: yedek gövdesi repo dosyasından alındı; hosted md5(prosrc) ile birebir aynı olduğu doğrulandı (pg_get_functiondef aynı gövdeyi gösterdi).

## Sonuç (2026-10-01)
- apply_migration time_off_one_notice_per_pass: success; version 20261003041000 olarak düzeltildi.
- Sonrası md5(prosrc): c4ae19927d678aece1ab2c02218952f6 (= dosyadaki gövde)
- Grant sonrası: {postgres=X/postgres}; anon/authenticated/service_role EXECUTE yok. prosecdef=true, search_path="".
- Advisors security SONRASI: 98 bulgu, aynı üç kural, yeni bulgu yok.
