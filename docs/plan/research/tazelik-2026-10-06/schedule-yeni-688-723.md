Tazelik ölçümü bitti: BL-688…BL-723 arasındaki 36 maddenin 17'si main'deki kodla kapanmış ama backlog'da hâlâ açık duruyor. Kalan 19 maddeden biri bayat, 14'ü salt hata düzeltmesi, 4'ü karar istiyor.

Ölçümün yapıldığı origin/main: **`9146ba6b`** (taze fetch). Kod commit'lerini ve dosyaları origin/main'den okudum, dilim arşivleriyle (`docs/plan/ekranlar/01-schedule/uygulama/*.md`) ve KAPANIŞ-ÖLÇÜMÜ §5 ile karşılaştırdım. Test koşmadım. Veritabanı sorgusu gerekmedi. Hiçbir dosyaya yazmadım.

| BL | hüküm | kanıt | sınıf | sahip | görünür | dilim | not |
|---|---|---|---|---|---|---|---|
| 688 | zaten kapalı | DB-1b `20339ae2`/`40f2948a`/`a089f778` + `ed74a30b`: süre dolunca `autosave`, "Auto-save · ad · saat" taslağı | – | – | – | DB-1b, W-1b | – |
| 689 | zaten kapalı | DB-1c `bb7df088`/`ec38901d` + `05c19950`/`9a6fe619`: Undo sunucudaki adımı geri alıyor; `b921a0fd` takas geri yüklemesi Undo adımı değil | – | – | – | DB-1c, W-1b | – |
| 690 | zaten kapalı | W-1a `6501b429`/`8440c6bb` + W-1b `659f0b9f`: geri sayımda kilit düşmüyor, düşerse bir kez kurtarılıp yeniden deneniyor | – | – | – | W-1a | – |
| 691 | zaten kapalı | `6501b429` (yenileyince düzenleme sürüyor) + `f667cfd5` (başka hafta görünüm modunda) | – | – | – | W-1a, W-1b | yenileme e2e'si T-1'de |
| 692 | zaten kapalı | DB-1b: bekleyen değişiklik listesi yalnız çağıranın; e2e `57726b9a` | – | – | – | DB-1b, W-1b | – |
| 693 | zaten kapalı | `8fec3a7d` (lokasyon başına `rls_can`) + `39e94551`/`ae526db3` (yükte taslak, kullanıcı, vardiya kimliği yok) | – | – | – | DB-2 | presence'taki `user_id` notu ayrı (DB-2 §3) |
| 694 | değişmiş | Veri kapandı (`511aed11`/`3304a858`/`9b93169d`); `ScheduleTemplateDialogs.tsx:227-242` Overwrite hâlâ tek tık, ad "Overwrite" | (a) S3 + Soru 3 (iki tık, "Replace current shifts") | nf-arayuz | evet | W-3 | ilk tık sayısı `preview_schedule_template_apply_service`'ten gelir |
| 695 | zaten kapalı | DB-1b: kira canlıyken 409 `schedule.draft_being_edited` + `46ed4225` sade metin | – | – | – | DB-1b, W-1b | – |
| 696 | zaten kapalı | DB-3 `511aed11`: şablon molayı saklıyor ve uyguluyor | – | – | – | DB-3 | – |
| 697 | zaten kapalı | DB-3: yeni vardiya `source_published_shift_id` almıyor; web `scheduleShiftMetadata.ts:25-32` buna bakıyor | – | – | – | DB-3 | ekranda e2e ile ölçülmedi |
| 698 | zaten kapalı | DB-1b ad biçimi + `recovered_draft_name`; `12b8e9b1` açılışta tek satır | – | – | – | DB-1b, W-1b | KK-162'nin "Ayşe sonra görür" yarısı ve şeritte kalıcı satır açık (W-1b §3) |
| 699 | geçerli | `templateApplyMessage.ts:28-38` `converted_open_count`'u okumuyor; dosya keşiften beri değişmedi | (a) P09 (düşen veri söylenir) | nf-arayuz | evet | W-3 | sayı sonuçta zaten var |
| 700 | zaten kapalı | BE-1 `7cb8813c`: Export authorize çekirdeğe soruyor, eski kapı silindi | – | – | – | BE-1 | BL-494 ayrı, açık |
| 701 | geçerli | `schedule-service.ts:480,513` önemli tarihleri service role ile okuyup TS'de süzüyor | (a) CLAUDE.md §9 (satır içi kapsam mantığı yeni eklenmez) | nf-db (+nf-backend) | hayır | DB-4 | DB-4 başlamadı |
| 702 | değişmiş | DB-1a `a4e0ba11`/`cf888c14` ad sızıntısını ve ipucusuz retleri kapattı; workspace genelinde benzersiz taslak/şablon adıyla yoklama açık (DB-1a §5) | (b) ad benzersizliği lokasyon başına mı | nf-db | hayır | DB-1a kalanı | – |
| 703 | zaten kapalı | `efe215a4` + BE-2b `7bd0190f`/`d2264f7a`/`27f102db`: kısmi teslim notu, kural açık kalıyor | – | – | – | BE-2, BE-2b | "bir kez yeniden dene" kararı (KARARLAR :414) yeni iş, uygulanmadı |
| 704 | zaten kapalı | DRAG-API `7f7e90dc` (kurallar ekrana ulaşıyor) + DRAG-UI `4d2e571a` (token, üç durum testli) | – | – | – | DRAG | – |
| 705 | geçerli | `DraftDropdownMenu.tsx`'te "Save as template" yok (`git grep` boş) | (a) KARARLAR "taslak ekranında da var" | nf-arayuz | evet | W-3 | – |
| 706 | geçerli | `SchedulePage.tsx:3456-3464` Enter odaktan bağımsız `onConfirm()` | (a) UI-13 / klavye erişilebilirliği | nf-arayuz | evet | W-2 | – |
| 707 | geçerli | `ShiftQuickEditor.tsx:1025-1036` Delete tek tık, onay yok | (a) UI-12 (yıkıcı = iki tık) | nf-arayuz | evet | W-2 | – |
| 708 | geçerli | `SaveDraftDialog.tsx:44-74` "Overwrite draft" tek tık; menüdeki satır ConfirmButton | (a) UI-12 | nf-arayuz | evet | W-3 | – |
| 709 | zaten kapalı | W-1b `fe5f1b61`: görünen her lokasyon izleniyor | – | – | – | W-1b | – |
| 710 | geçerli | `SchedulePage.tsx:3397` `` `${n} auto-fill assignment could not be applied.` `` | (a) açık metin hatası | nf-arayuz | evet | W-3 | – |
| 711 | geçerli | Pencere dosyaları keşiften (`06a74d5a`) beri değişmedi | (a) WCAG 2.4.3 / 2.1.1 | nf-arayuz | evet | W-2 | BL-327(3) ile örtüşme ölçülmedi |
| 712 | geçerli | styles.css'e yalnız VAR-UYG ve DRAG dokundu; sayaç rengi değişmedi | (a) WCAG AA 4,5:1 | nf-arayuz | evet | W-2 | 3,56 oranı yeniden ölçülmedi (tarayıcı yok) |
| 713 | geçerli | `ScheduleLocationHeader.tsx` keşiften beri değişmedi | (a) WCAG 1.4.1 | nf-arayuz | evet | W-2 | metnin sözü P21'le |
| 714 | geçerli | `ScheduleGridHeaders.tsx` değişmedi (`onClick={onManageLogo}` :62; haftanın atlaması dış katmanda) | (a) açık hata | nf-arayuz | evet | W-4 | davranış tarayıcıda yeniden denenmedi |
| 715 | geçerli | `DefaultHoursReviewDialog` stil B'ye geçmedi (W-3 commit'i yok) | (a) stil B kararı (BL-318) | nf-arayuz | evet | W-3 | – |
| 716 | geçerli | ShiftQuickEditor'a yalnız `e986f346` dokundu (yerleşim değil) | (a) açık görsel hata | nf-arayuz | evet | W-4 | – |
| 717 | geçerli | VAR'da cd11-a/b/c hazır; KARARLAR'da seçim yok | (b) görsel karar (P04), Mert seçer | nf-arayuz | evet | VAR→W-5 | öneri B |
| 718 | bayat | KARARLAR :519 "Schedule telefonda tamamen kapalı"; `81aa5544` + `bdd1be43` | – | – | – | TEL-KAPALI | C-P2 sorusu bu kararla düştü |
| 719 | geçerli | `ScheduleEditTimeoutDialog.tsx` yalnız "No activity for N minutes."; dosya değişmedi | (a) S1'in sonucu (Auto-save) söylenmiyor + stil B | nf-arayuz | evet | W-3 | metin P21 |
| 720 | geçerli | ShiftQuickEditor yerleşimi değişmedi | (a) §9 görsel tutarlılık | nf-arayuz | evet | W-4 | – |
| 721 | geçerli | Hafta seçici dosyası değişmedi | (a) açık görsel hata | nf-arayuz | evet | W-4 | – |
| 722 | geçerli | `App.tsx:334` `schedule/templates` sayfası + Templates penceresi ikisi de var | (b) hangi yüzey kalır | nf-arayuz | evet | W-4 | – |
| 723 | geçerli | (1) `SchedulePage.tsx:1829` "Resolving the published week." duruyor; (2)–(4) W-4 commit'i yok | (a) P21 + WCAG + erişilebilir ad | nf-arayuz | evet | W-4 | (2) "read-only" satırının biçimi ufak tasarım sorusu olabilir |

**DONE.md önerileri (kapanan 17 madde):**
- BL-688: Schedule'da 15 dakika hareketsiz kalınca iş artık silinmiyor; 15 saniye geri sayar ve "Auto-save · ad · saat" taslağına geçer (`20339ae2`, `ed74a30b`).
- BL-689: Undo ve Ctrl+Z artık sunucudaki adımı da geri alıyor; geri alınan değişiklik bir dakika sonra geri gelmiyor (`ec38901d`, `05c19950`).
- BL-690: "Keep editing?" sürerken kilit düşmüyor; düşerse aynı kişinin işi sessizce kurtarılıyor (`6501b429`, `659f0b9f`).
- BL-691: Düzenlerken sayfa yenilenince vardiyalar geri geliyor; başka haftaya geçince o hafta görünüm modunda açılıyor (`6501b429`, `f667cfd5`).
- BL-692: Bir müdürün kaydetmediği değişiklik artık öteki müdürün ızgarasında görünmüyor (DB-1b `20339ae2`, e2e `57726b9a`).
- BL-693: Schedule'ın canlı kanalı lokasyon başına ve yetki çekirdeğine soruyor; çalışan dinleyemiyor, yükte taslak ve kişi kimliği yok (`8fec3a7d`, `39e94551`).
- BL-695: Başkasının düzenlediği taslak silinemiyor; "Someone is editing this draft." deniyor (DB-1b, `46ed4225`).
- BL-696: Şablondan uygulanan vardiya molasını koruyor (`511aed11`).
- BL-697: Yayındaki haftaya yeni eklenen vardiya artık "Live" görünmüyor (DB-3 `511aed11`).
- BL-698: Kurtarma taslağı "Auto-save · Ayşe Yılmaz · saat" adını alıyor ve açılışta söyleniyor (DB-1b, `12b8e9b1`).
- BL-700: Export penceresinin izin kontrolü yetki çekirdeğinde; üye olmayan 404 alıyor (`7cb8813c`).
- BL-703: Haftalık e-posta bir alıcıya gitmezse ekran kime gitmediğini söylüyor; kural kapanmıyor (`efe215a4`, `d2264f7a`, `27f102db`).
- BL-704: Sürüklerken uygun hücre yeşil, izinli gün kırmızı, müsait değil turuncu yanıyor (`7f7e90dc`, `4d2e571a`).
- BL-709: "Someone is editing" görünen her lokasyonu izliyor (`fe5f1b61`).
- BL-718: Kapatıldı, bayat: Schedule telefonda kapalı (KARARLAR, `81aa5544`, `bdd1be43`). Telefon düzeni sorusu düştü.
- BL-694 ve BL-702 için kısmi kapanış notu: veri tarafı ve ad sızıntısı kapandı (`511aed11`, `a4e0ba11`). Kalan iki tık ile ad benzersizliği açık.

**Ölçülemeyenler:**
- BL-711, 712, 713, 714, 716, 720, 721'de ekran tarayıcıda yeniden ölçülmedi. Hüküm yalnız "dosyalar keşiften (`06a74d5a`) beri değişmedi" kanıtına dayanıyor; 712'deki 3,56:1 oranı da yeniden ölçülmedi.
- BL-697 ve BL-691'in ekrandaki sonucu e2e ile doğrulanmadı.

**Yolda bulunanlar:** §5 listesindeki şu maddeler bu turun aralığında değil, ama main'de kapanmış görünüyor ve backlog'da hâlâ açık:
- DB-1a'dan: BL-159, BL-412.
- DB-1b'den: BL-224.
- DB-3'ten: BL-292, BL-545.
- BE-1 ve BE-2'den: BL-280(4), BL-282, BL-391, BL-168, BL-685.
- W-1a'dan: BL-616.
- VAR-UYG'den: BL-524, BL-525.
- BE-2 ölçümünden: BL-101.

Bunlar ayrı bir tazelik turunda ölçülmeli.
