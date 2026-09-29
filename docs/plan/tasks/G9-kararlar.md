# G9 — İzin, takas ve kapsam kuralları: kararlar (2026-09-29, işçi oturumu nf-db)

Dal `task/g9-timeoff-exchange` (taban `origin/main` `23f734bf`).

## A. Küçük üç kural — migration `20260929180000_time_off_doors_close_with_the_workspace.sql`
Test: `supabase/tests/time_off_doors_close_with_the_workspace.test.sql` (7 hücre, ci-green'e eklendi).

1. **BL-247: kapalı workspace'te izin kapıları kapalı.** `employee_hub_actor_service` (çalışanın
   izin talebi, iptal talebi ve Employee Hub'ın bu fonksiyondan geçen diğer girişleri) artık
   çekirdeğin "workspace bu kişiye açık mı" sorusunu (`app_private.workspace_open_to_actor`)
   soruyor; kapalıysa 42501 + `authz.workspace_closed`. Sahibin kendi iznini onaylama kısayolu
   (`app_private.authorize_time_off_decision`) da `workspace_open` bakıyor; kapalıysa çekirdeğin
   kendi reddi geliyor. Örnek: askıya alınmış workspace'te Ali izin isteyemez, sahip kendi
   iznini onaylayamaz, kimse onaylı izin için iptal isteyemez.
   `time_off_is_the_owners_own`'a dokunulmadı: bildirim sağlık kontrolü de onu okuyor; kapalı
   workspace'in geçmişi alarma dönmesin.
2. **BL-220: sağlık kontrolü sahipliği olay anına göre biliyor.** Sahibin kendi izni "talep
   edenin aynı anda kendisinin onayladığı talep" olarak tanınıyor (`record_owner_time_off`
   aynı işlemde onaylıyor; olay satırları değişmez). Sahiplik devrinden sonra eski sahibin izni
   yanlış alarm vermiyor, yeni sahibin önceden kaybolmuş bildirimi de gizlenmiyor.
   Yeni kolon/işaret gerekmedi (backlog'daki "olay satırına işaret" önerisi yerine var olan iz).
3. **BL-109: yazma bekçisinin metni nötr.** "A shift change is being reviewed…" yerine
   "Another change is being saved in this workspace. Your changes were not saved; try again."
   Aynı kilidi yayın da tutuyor; eski metin yanlış yönlendiriyordu. Metin API/web'de geçmiyor.

Kanıt: migration'sız 5 kırmızı; migration'la 7/7. Etkilenen 85 pgTAP dosyası migration'lı ve
migration'sız: tek fark yeni dosya, yeni kırmızı yok; DB sayaçları önce/sonra aynı
(05:19–05:28, db.lock nf-db/isci-g9).
