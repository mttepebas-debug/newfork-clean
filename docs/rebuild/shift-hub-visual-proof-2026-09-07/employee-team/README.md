# My Team günlük vardiyaları — G02/G07/G08

7 Eylül 2026. Plandaki115. satırın My Team → kendi vardiyası → aynı cover/swap detayı adımı uygulandı. Önceki My Team yalnız çalışan rehberiydi; vardiya sahipliği gösterdiği varsayılmadı.

## Ürün ve tasarım

Working together bölümünde seçili günün yayınlanmış vardiyaları lokasyona göre gruplanır; lokasyonun saat dilimi görünür. Kendi vardiyasında You ve Find cover or swap bağlantısı vardır; teammate kartında bu aksiyon yoktur. Bağlantı Schedule'dakiyle aynı shift_id/from/to sözleşmesini kullanır. Eski Team directory korunur; kişisel shift notları ekip listesine taşınmaz.

Tarih formu yeni gün yüklenirken yerinde kalır. URL, Show day/Today ve Back tarafından yönetilir; refetch uygulanmamış tarih taslağını silmez. My schedule seçili günü korur. Hatalı/erişim reddi refresh'te eski atama aksiyonları gizlenir, retry sunulur. Authoritative API aynı employee-hub query prefix'iyle yeniden okunur; optimistic owner değişimi yoktur. Date/team okuması bağımsız olduğu için42 günlük gereksiz parent query çalışmaz. Yetkili mevcut API kullanılır; yeni endpoint/migration yoktur.

## Yerel doğrulama

- Yeni component **7/7**, parent EmployeeHub **22/22**. Actual QueryClient + ortak invalidation: source Alex'ten Blake'e geçince Alex'in eylemi kalkar, Blake adı görünür. Teammate'e aksiyon yok, doğru shift linki, private note yok, gün/draft/Back/loading/retry/unresolved hours testli.
- Son web typecheck, hedefli ESLint, build ve diff whitespace PASS. İlk typecheck başka ScheduleRequestsPage testindeki toHaveAttribute tip hatasıyla başarısızdı; o dosyaya dokunulmadı. Final koşumda hata artık yoktu.
- [visual.json](visual.json): iki normal gerçek employee UI oturumu,320/390/768/1440 × light/dark16 durum +390px/200% root font2 durum = **18/18**. Yatay taşma0, kontroller≥44px, görünür klavye odağı. Native zoom/reader kanıtı değildir.
- Enter ile gün uygulama, Back ile doğru tarihi geri alma; My Team→My Schedule→Back; kendi linkinde Enter→doğru shift cover/swap dialogu ve sorumluluk metni. Bu turda ilan gönderilmedi.
- İlk görsel tur ölçümleri geçse de320px My schedule kelimesi bölünüyordu; bağlantı ayrı satıra alındı. Dark roster metadata kontrastı ve native date icon color-scheme düzeltildi. İlk görseller pre-polish altında, nihai görseller kök klasördedir. Final employee320 light ve1440 dark gözle incelendi.

## 19 gerçek yüzeyde atama yayılımı

Önceki15 yüzeye Alex ve Blake'in iki tarihli My Team ekranları eklendi. Üç normal UI oturumu; iki hafta/lokasyon, manager/employee Schedule ve Line Up, üç inbox ve dört My Team açık/görünür. Yalnız sahipli8/15 Aralık QA vardiyaları gerçek create→peer accept→manager preview/final ile takas edildi. Yeni employee claim/atama yazım yolu yoktur.

| Koşum | Sonuç |
|---|---|
|30 yeni ardışık takas|P95 command-start üst sınırı **1384ms**, min824, max1913; her örnekte19 DOM/two-owner/two-version doğru|
|Reconnect|**943ms**; offline owner/inbox korundu, navigation0|
|Gerçek websocket engelli fallback|**59688ms**;296 engellenmiş WS girişimi, changed0; HTTP polling, navigation0|

[timings.json](timings.json), [reconnect.json](reconnect.json), [fallback.json](fallback.json). Tüm32 örnekte HTTP/pageerror/command failure0, owner peer kabulünde değişmez. My Team'de devreden kişinin kendi eylemi kalkar; aynı shift_id yeni employee_id ile görünür. Command başlangıcı→son DOM gözlemi konservatif üst sınırdır; DB commit timestamp ölçümü değildir.30+reconnect ilk web build, fallback ve final görseller yalnız CSS/parent sınıfı görsel düzeltmesi içeren web-v2 build üzerindedir; assignment/render mantığı aynı.

[final-data.json](final-data.json): **187+187=374 snapshot**, her sürüm tek doğru owner. Son verify önceki372 içeriği korudu; ara verify310 eski içeriği korumuştu. Son owner Alex/Blake ilk sırasına döndü. Test case/audit/snapshot geçmişi korunur. Sabit API5560, web5561; shared dev5555/5556/Auth ve ilgisiz WIP korunur. Owned listener'lar finalde kapatıldı.

## Açık kapsam

G01–G10 genel goal açık. Bu tur My Team atama/eylem tutarlılığını kapatır; tüm case-detail/history varyantlarının realtime kanıtı değildir. Sonraki teknik iş açık talep detayında iki sorumlunun/güncel publication durumunun gösterimi; sonra staffing30 örnek ve kalan role/eligibility/recovery varyantları. Offline1.2sn korunma kontrolü uzun süre offline polling'e genellenmez. Native reader/gerçek cihaz, insan UAT/tasarım puanı ve hosted/pilot kapıları tamamlanmış sayılmaz. [source-sha256.json](source-sha256.json) bu kaydın kaynaklarını sabitler; genel dirty checkout/release manifest'i değildir.
