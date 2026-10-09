# VAR-ART-LIST — liste sayfaları için ortak masaüstü düzeni, 5 sistem (nf-arayuz)

- **Karar:** R0, yeni Artifact (özel): https://claude.ai/artifact/R22hrq2pwAET22CKT6K1BE — main'e girmez. VAR-ART-EMP'in üstüne yazmadım: onun telefon bölümü (G2) Mert'in sonraki mobil konuşması için kalsın.
- **İzin:** gerekmiyor; Mert'e açmak için sahibin Share menüsü.
- **Risk:** 🟢 her sistem Employees tam sayfa + Requests · Time off, Announcements, Notifications önizlemesiyle; 1440'ta ve 390'da yatay taşma yok (ölçüldü), sayfa hatasız.
- **Soru:** Mert bir sistem seçer; önerim yok (P04). C, Sistem 1'in temeli.
- **Sonraki:** seçim gelince sistem önce Employees'e (EKRAN-03 C), sonra öteki sayfalara kendi turlarında.

## Envanter (kod, origin/main; prototip bağlantısı artık telefon tasarımlarını tutuyor, ölçüler KARARLAR "Liste sayfalarının ortak dili"nden)
| Sayfa | Bugünkü dil | Ana düğme | Sekmeler | Süzgeç / arama | Kendine has |
|---|---|---|---|---|---|
| Employees | eski (Catalog başlık, gri kutulu sekme) | Add employee (başlıkta, büyük yeşil) | All, Invited, Onboarding, Needs Attention, Active, Archived | Location · arama | sütun seçici, "No location", "+1" |
| Requests · Time off | eski | — | tür: Time off (sayaç), Shift changes · kuyruk: Needs review, Closed | Location · arama | iki seviye sekme, Decide by, açılan vardiya sayısı |
| Requests · Shift changes | hub | — | Ready for review (sayaç), Finding cover, Awaiting response, History | Location · arama · tarih aralığı (yalnız adreste) | Candidates sütunu |
| Settings → Documents | ortak | New document (beyaz, süzgeç satırı) | All, Draft, Published, Archived | Requirement · arama | satır menüsü |
| Employees → Documents | ortak | — | All, Needs review, Missing, Expired, Completed (sayaçlı) | Location · Document type · arama | inceleme çekmecesi |
| Announcements | ortak | New announcement | All, Draft (n), Scheduled (n), Published, Archived | Location · arama | çalışanda sekme yok, satırda Acknowledge |
| Important Dates | ortak | New date | Upcoming, Past, Archived | Type · arama | Repeats yearly, Schedule flag |
| Notifications | ortak | (seçimle Mark as read) | Unread (n), Read (n) | Category, arama yok | kutucuklar, "N selected", gün grupları, Dismiss |
| Availability | ortak | — | All, Submitted, Not submitted | Location · arama | "N employees", 7 gün sütunu |
| Locations, Jobs, Acknowledgements, Shift catalog | eski Settings başlığı | Add location / Create ▾ / Add template / Add shift type | Jobs: All/Departments/Jobs; Ack.: Templates/Retention; Catalog: Shift types/labels | arama · Show archived | yukarı/aşağı taşıma, departman grupları |

## Sistemler
| | Fikir | Güçlü | Zayıf | Öteki sayfalara geçiş |
|---|---|---|---|---|
| **1 · C** | bugünkü ortak dil + yeşil ana düğme süzgeç satırının sağ ucunda; sayaç sekme içinde; Requests'te ikinci alt çizgili sekme satırı | en az değişiklik, altı sayfa zaten bu dilde; C korunuyor | iki seviye sekme üst üste biraz kalabalık | ortak dildeki 6 sayfada yalnız düğme rengi beyazdan yeşile; Employees ve Requests ortak dile geçer; Settings dörtlüsü başlığını değiştirir |
| **2** | başlıkta yeşil ana düğme; sekmeler + süzgeç + tablo + "N shown" tek beyaz panelde | sayfa tek nesne gibi okunur, sakin | başlıkta düğme = KARARLAR'daki "başlıkta düğme yok" kuralını ters çevirir | 7 sayfada düğme başlığa taşınır, araç çubuğu panele girer; Requests'in tür seçimi başlığın sağında |
| **3** | sekmeler ve süzgeçler solda dikey rayda (sayaçlı), tablo sağda, üstte yalnız arama | çok süzgeçli sayfalar (Requests, Employees → Documents) rahat; sayaçlar hep görünür | tablo 210 px daralır; Availability'nin 7 gün sütunu ve Employees'in 6 sütunu sıkışır | her sayfa iki sütunlu iskelete geçer; en büyük iş |
| **4** | kısa başlık + sayı; tek satır komut çubuğu: kayan seçici, kesik çizgili süzgeç hapları, yuvarlak arama; düğme başlığın sağında; sık satırlar | en yoğun, ekrana en çok satır sığar; modern | 38 px başlık ve 50 px satır kuralı değişir; Employees'in 6 sekmesiyle çubuk dolu | bütün sayfalarda başlık ve satır ölçüsü küçülür; sekmeler seçiciye döner |
| **5** | sekmeler sayı kutucukları (dikkat isteyen amber); süzgeçler silinebilir çip + "+ Filter"; yeşil düğme süzgeç satırı ucunda | iş yükü bir bakışta; Requests ve Documents gibi kuyruk sayfalarına çok uygun | sayaçsız sekmelerde ("Closed", "Archived") kutucuk boş "—"; Important Dates'te anlamı zayıf | her sayfa sekme sayacı ister (veri katmanı: Employees, Important Dates, Settings'te sayaç yok) |

## Görüntüler (1440, `C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\nf-arayuz\VAR-ART-LIST\`)
- Today: `s0-employees.png`, `s0-announcements.png`
- Her sistem: `s{1..5}-employees.png`, `s{1..5}-requests.png`, `s{1..5}-announcements.png`, `s{1..5}-notifications.png`
- Bütün sayfa: `_whole-page.png`
