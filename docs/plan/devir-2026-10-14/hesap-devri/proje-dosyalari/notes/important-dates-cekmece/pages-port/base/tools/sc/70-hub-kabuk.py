# Hub area: the employee's pages (7.0-7.4), Announcements (8.0, 8.1),
# Notifications (9.0) and the shell's own pages (0.1-0.8).
# Setups live in mock/hub-setups.ts; the shell's extra answers in mock/hub-service.ts.

NO_SHIFT = "5eed0000-0000-4000-8000-00000000ffff"  # an id no shift has
DST_SHIFT = "0000d570-0000-4000-8000-00000000d570"  # hub-dst-shift's Saturday close
MY_CASE = "/app/employee-hub/shift-hub?hub_view=requests&case=000007c1-0000-4000-8000-0000000007c1"  # Maria's own cover search
INVITE = "/app/employee-hub/shift-hub?hub_view=requests&case=000007c2-0000-4000-8000-0000000007c2"  # Priya's swap invite to Maria
OFFER = "/app/employee-hub/shift-hub?offer=000007c3-0000-4000-8000-0000000007c3"  # hub-offer-shift
DOWNTOWN = "00000101-0000-4000-8000-000000000101"
EMP_NO_NOTIFY = ["workspace.read", "schedule.read", "announcements.read"]
EMP_NO_ANNOUNCE = ["workspace.read", "schedule.read", "notifications.read"]
HUB = r"/employee-hub$"
EXCH = r"/shift-exchanges$"

# ---------------------------------------------------------------- 7.0 Employee home
# The home page's links to the other hub pages stay inside this page.
page("7.0")["via"] = r"^/app/employee-hub/(schedule|shift-hub|my-availability)(/.*)?$"
set_part("7.0", "Genel bakış · Home", ["home", "timeoff"])
set_part("7.0", "Vardiya çekmecesi · Your shift", ["shift"])
replace("7.0", "timeoff", sc("timeoff", "Request time off kısayolu: izin formu açılır", E, [click("Request time off")], part="Genel bakış · Home"))
extend("7.0", [
    sc("loading", "Yükleniyor: Getting your day ready…", E, hold=[HUB]),
    sc("error", "Okunamadı: Employee Hub is unavailable + Retry", E, fail=[{"path": HUB, "method": "GET", "status": 500}]),
    sc("owner-no-record", "Owner Employee view: çalışan kaydı yok, yetkisiz kartı", O),
    sc("manager-no-record", "Manager Employee view: çalışan kaydı yok, yetkisiz kartı", M),
    sc("owner-record", "Owner kendi çalışan kaydıyla: sol menüde Management view", O, setup="hub-staff-employee"),
], part="Sayfa durumları")
extend("7.0", [
    sc("starts-soon", "Bugün vardiya: TODAY'S SHIFT, Starts in 2h 15m", E, setup="hub-shift-soon"),
    sc("in-progress", "Vardiya sürüyor: SCHEDULED NOW", E, setup="hub-shift-now"),
    sc("overnight", "Gece yarısını geçen vardiya: Ends next day", E, setup="hub-overnight"),
    sc("device-time", "Lokasyonun saat dilimi yok: (device time)", E, setup="hub-device-time"),
    sc("no-shifts", "Yayınlanmış vardiya yok: LOOKING AHEAD + Update availability", E, setup="hub-no-shifts"),
], part="Ana kart · Your shift")
extend("7.0", [
    sc("offline", "Çevrimdışı: You're offline + Refresh schedule", E, setup="hub-offline"),
    sc("stale", "Yenileme düştü: Your schedule may be out of date", E, setup="hub-stale", steps=[{"wait": 2500}]),
], part="Uyarı satırı")
extend("7.0", [
    sc("radar-swap", "Bekleyen takas daveti: Respond to a shift swap, detay açılır", E, [click("Respond to a shift swap")]),
    sc("radar-clear", "Bekleyen yok: You're all caught up", E, setup="hub-caught-up"),
    sc("radar-error", "Talepler okunamadı: Requests couldn't be checked", E, fail=[{"path": EXCH, "method": "GET", "status": 500}]),
], part="Bekleyen işler · On your radar")
extend("7.0", [
    sc("bell-many", "Zil sayacı 9+ (120 okunmamış bildirim)", E, setup="hub-many-notices"),
    sc("no-notify", "notifications.read yok: zil ve Latest updates yok", E, perms=EMP_NO_NOTIFY),
    sc("no-announce", "announcements.read yok: Team notices yok", E, perms=EMP_NO_ANNOUNCE),
    sc("updates-error", "Latest updates okunamadı: Try again", E, fail=[{"path": r"/communications/notifications$", "method": "GET", "status": 500}]),
    sc("notices-error", "Team notices okunamadı: Try again", E, fail=[{"path": r"/communications/announcements$", "method": "GET", "status": 500}]),
    sc("notices-empty", "Team notices boş: No new notices", E, setup="hub-no-announcements"),
], part="Bildirim ve duyuru kartları · Latest updates, Team notices")
extend("7.0", [
    sc("reminder-add", "Hatırlatma ekle: listeye girer", E, [fill("input[aria-label='New personal reminder']", "Bring black socks for Saturday"), click("Add reminder")]),
    sc("reminder-done", "Hatırlatmayı tamamla (üstü çizili, gizlenir)", E, [click("Show completed"), click("Pick up a new apron before Saturday")]),
    sc("reminder-reopen", "Tamamlananı geri aç", E, [click("Show completed"), click("Sign up for the wine tasting training")]),
    sc("reminder-remove", "Tamamlananı sil (çöp kutusu, tek tık)", E, [click("Show completed"), click("Remove Sign up for the wine tasting training")]),
    sc("reminder-all", "3'ten fazla açık hatırlatma: View all 6", E, [click("View all 6")], setup="hub-many-reminders"),
    sc("reminder-completed", "Show completed: tamamlananlar görünür", E, [click("Show completed")]),
    sc("reminder-empty", "Hatırlatma listesi boş", E, setup="hub-no-reminders"),
    sc("reminder-error", "Kaydedilemedi: Your change hasn't been confirmed", E, [fill("input[aria-label='New personal reminder']", "Bring black socks for Saturday"), click("Add reminder")],
       fail=[{"path": r"/personal-tasks$", "method": "POST", "status": 500}]),
    sc("reminder-load-error", "Hatırlatmalar okunamadı: Try again", E, fail=[{"path": r"/personal-tasks$", "method": "GET", "status": 500}]),
], part="Hatırlatmalar · My reminders")
extend("7.0", [
    sc("week-day", "7 gün şeridinden güne geçiş: Schedule gün görünümü", E, [click(".eh-week a:nth-child(2)")]),
    sc("team-empty", "Your team boş: ortak lokasyon yok", E, setup="hub-alone"),
], part="Yaklaşanlar ve takım · Coming up, Your team")
extend("7.0", [
    sc("shift-missing", "Bilinmeyen vardiya: Shift unavailable", E, path=f"/app/employee-hub?shift={NO_SHIFT}"),
    sc("shift-note", "Vardiya notu: Shift notes", E, [click("View shift")], setup="hub-shift-note"),
    sc("shift-overnight", "Ertesi gün biten vardiya: Ends the following day", E, [click("View shift")], setup="hub-overnight"),
    sc("offer-entry", "Cover ya da swap başlatmanın tek yolu: çekmecede Find cover or swap", E, path="/app/employee-hub?shift=000007c3-0000-4000-8000-0000000007c3",
       setup="hub-offer-shift", steps=[click("Find cover or swap")]),
], part="Vardiya çekmecesi · Your shift")

# ---------------------------------------------------------------- 7.1 My schedule
set_part("7.1", "Hafta ve gün · Week, Day", ["week", "next"])
extend("7.1", [
    sc("previous", "Önceki hafta", E, [click("Previous week")]),
    sc("day", "Gün görünümü", E, path="/app/employee-hub/schedule?view=day"),
    sc("later", "Yayınlanmamış hafta: iki hafta ileri", E, [click("Next week"), click("Next week")]),
], part="Hafta ve gün · Week, Day")
extend("7.1", [
    sc("calendar", "Takvim açık: önemli ve kapalı günler", E, [click("Open schedule calendar")]),
    sc("mine", "My Schedule: yalnız Maria'nın satırı", E, [click("My Schedule")]),
    sc("hide", "Hide Unscheduled: vardiyası olmayanlar gizli", E, [click("Hide Unscheduled")]),
    sc("locations", "Lokasyon süzgeci (Maria'nın tek lokasyonu) ve Merged/Separate", E, [click("All locations")]),
    sc("jobs", "Job süzgeci açık", E, [click("All jobs")]),
    sc("settings", "Settings menüsü açık", E, [click("Settings")]),
    sc("filter-esc", "Seçimden sonra Esc: önce açılır liste kapanır, Server süzgeci kalır", E, [click("All jobs"), click("Server"), {"wait": 300}, {"act": "key", "key": "Escape", "target": "main h1"}]),
    sc("filter-esc-2", "İkinci Esc: Server süzgeci kalkar (katman katman geri alma)", E, [click("All jobs"), click("Server"), {"wait": 300}, {"act": "key", "key": "Escape", "target": "main h1"}, {"wait": 300}, {"act": "key", "key": "Escape", "target": "main h1"}]),
], part="Üst çubuk ve süzgeçler · Top bar")
extend("7.1", [
    sc("loading", "Pano yükleniyor: Loading your schedule…", E, hold=[r"/employee-hub/schedule$"]),
    sc("error", "Pano okunamadı: Schedule is unavailable + Retry", E, fail=[{"path": r"/employee-hub/schedule$", "method": "GET", "status": 500}]),
    sc("hub-error", "Hub okunamadı: Employee Hub is unavailable", E, fail=[{"path": HUB, "method": "GET", "status": 500}]),
], part="Sayfa durumları")

# ---------------------------------------------------------------- 7.2 Shift Hub
set_part("7.2", "Açık vardiyalar · Available", ["available", "time-off", "cover"])
set_part("7.2", "Taleplerim ve geçmiş · My requests, History", ["mine", "history"])
extend("7.2", [
    sc("conflict", "Availability conflict + Request anyway", E, setup="hub-evening-unavailable"),
    sc("applied", "Başvurulmuş kart: Awaiting manager + View request", E, setup="hub-applied"),
    sc("empty", "Eşleşme yok: No eligible shifts right now", E, [fill("input[placeholder='Search date, location or position']", "zzz")]),
    sc("search", "Arama: Jake (ada, tarihe, lokasyona göre)", E, [fill("input[placeholder='Search date, location or position']", "Jake")]),
    sc("location", "Lokasyon süzgeci: Downtown", E, [fill("select", DOWNTOWN)]),
], part="Açık vardiyalar · Available")
extend("7.2", [
    sc("invite", "Takas daveti: You give / You receive, Accept request, Decline", E, [], path=INVITE),
    sc("invite-accept", "Daveti kabul et: Request accepted. Waiting for final manager approval.", E, path=INVITE, steps=[click("Accept request")]),
    sc("invite-decline", "Daveti reddet (tek tık)", E, path=INVITE, steps=[click("Decline")]),
    sc("invite-anyway", "Çakışmalı davet: Accept anyway", E, [], path=INVITE, setup="hub-invite-conflict"),
    sc("own-search-empty", "Henüz aday yok: Finding cover", E, [], path=MY_CASE, setup="hub-no-candidates"),
    sc("close-dialog", "Aramayı kapat penceresi: gerekçe boşken Close search kapalı", E, path=MY_CASE, steps=[click("Close cover search")]),
    sc("close-confirm", "Gerekçe yazıp iki tıkla kapat: arama kapandı", E, path=MY_CASE, steps=[click("Close cover search"),
        fill("textarea", "I found someone to cover outside the app."), click("Close search"), click("Confirm close"), {"wait": 600}]),
    sc("withdraw", "Kendi başvurusunu geri çek: Withdraw request", E, [click("Request to cover"), {"wait": 800}, click("Withdraw request")]),
    sc("approved", "Onaylanmış talep: Transfer approved + Request history", E, [click("History"), click("Approved"), click("Request history")]),
    sc("closed", "Kendi kapattığı talep: Start a new cover or swap request", E, [click("History"), click("Search closed")]),
    sc("invalidated", "Vardiya değişti: Shift details changed bandı", E, [click("History"), click("Shift changed")], setup="hub-invalidated"),
    sc("expired", "Süresi geçti: Expired", E, [click("History"), click("Expired")], setup="hub-expired"),
    sc("unpublished", "Yayından kalkmış vardiya: This shift is no longer published", E, [click("History"), click("Approved")], setup="hub-unpublished"),
    sc("unknown-case", "Bilinmeyen talep: Request unavailable", E, path=f"/app/employee-hub/shift-hub?case={NO_SHIFT}"),
    sc("outside-filter", "Detay açıkken arama: This request is outside your list filters", E,
       path=INVITE, steps=[fill("input[placeholder='Search date, location or position']", "zzz")]),
], part="Talep ayrıntısı · Request details")
# The base list (screens.py) has its own "own-search"; this one opens the case by its link.
replace("7.2", "own-search", sc("own-search", "Kendi cover araması: başvuran aday, özel not, Close cover search", E, [], path=MY_CASE, part="Talep ayrıntısı · Request details"))
extend("7.2", [
    sc("offer-cover", "Find cover or swap: Find cover · Offer to eligible teammates", E, path=OFFER, setup="hub-offer-shift"),
    sc("offer-ask", "Find cover: Ask a teammate (aday seçimi)", E, path=OFFER, setup="hub-offer-shift", steps=[click("Ask a teammate")]),
    sc("offer-swap", "Swap shifts: takım arkadaşı vardiyası, YOU RECEIVE önizlemesi", E, path=OFFER, setup="hub-offer-shift",
       steps=[click("Swap shifts"), {"wait": 500}, fill("label=Eligible teammate shift", "000007c4-0000-4000-8000-0000000007c4")]),
    sc("offer-active", "Vardiyada açık talep var: This shift already has an active request", E, path=OFFER, setup="hub-offer-active"),
    sc("offer-retry", "Aday kontrolü düştü: Retry eligibility check", E, path=OFFER, setup="hub-candidates-fail",
       steps=[click("Ask a teammate")]),
    sc("offer-discard", "Not yazıp vazgeç: Keep editing / Discard request", E, path=OFFER, setup="hub-offer-shift",
       steps=[fill("textarea", "Family dinner that night."), click("Cancel")]),
    sc("no-match", "Eşleşme yok: No eligible matches + Start a cover search instead", E, path="/app/employee-hub/shift-hub?offer=000007c5-0000-4000-8000-0000000007c5",
       setup="hub-offer-lonely", steps=[click("Ask a teammate")]),
    sc("dst", "Saat değişimi gecesini kesen vardiya: Clock change during this shift", E, path=f"/app/employee-hub/shift-hub?offer={DST_SHIFT}", setup="hub-dst-shift"),
], part="Find cover or swap penceresi")
extend("7.2", [
    sc("loading", "Yükleniyor: Loading shift changes", E, hold=[EXCH]),
    sc("error", "Okunamadı: Shift Hub is unavailable + Retry", E, fail=[{"path": EXCH, "method": "GET", "status": 500}]),
    sc("offline", "Çevrimdışı bandı: düğmeler kapalı", E, setup="hub-offline"),
    sc("stale", "Yenileme düştü: Couldn't refresh these requests + Retry", E, setup="hub-exchanges-stale", steps=[{"wait": 2500}]),
    sc("command-error", "Komut reddedildi (409): hata satırı", E, [click("Request to cover")],
       fail=[{"path": EXCH, "method": "POST", "status": 409, "reason": "exchange.stale", "error": "This request changed. Refresh and try again."}]),
], part="Sayfa durumları")

# ---------------------------------------------------------------- 7.3 My availability
set_part("7.3", "Haftalık müsaitlik · Availability", ["week", "add"])
set_part("7.3", "İzin talepleri · Time Off Requests", ["timeoff"])
extend("7.3", [
    sc("saved", "Kaydet: Saved", E, [click("Add hours on Monday"), click("Save")]),
    sc("save-conflict", "Kayıt çakışması (409) + Reload", E, [click("Add hours on Monday"), click("Save")],
       fail=[{"path": r"/availability/weekly$", "method": "POST", "status": 409, "reason": "availability.changed", "error": "Availability changed. Reload before saving; your draft has not been saved."}]),
    sc("all-day", "Pazartesi bütün gün müsait değil", E, [click("[aria-label='Monday all day unavailable']")]),
    sc("shift-types", "Vardiya türü kipi: gün başına vardiya türleri", E, setup="availability-shift-types"),
    sc("not-submitted", "Hiç gönderilmemiş: Not submitted", E, setup="hub-not-submitted"),
    sc("leave-dialog", "Kaydedilmemişken sekme değiştir: Discard availability changes?", E, [click("Add hours on Monday"), click("Time Off Requests")]),
    sc("load-error", "Okunamadı + Retry", E, fail=[{"path": r"/availability/weekly$", "method": "GET", "status": 500}]),
], part="Haftalık müsaitlik · Availability")
TO = "/app/employee-hub/my-availability?section=time-off"
START = ".date-pair label:nth-child(1) input"
END = ".date-pair label:nth-child(2) input"
extend("7.3", [
    sc("sent", "Tam gün izin isteği gönderildi: Request sent.", E, path=TO, steps=[fill(START, "{today+20}"), fill(END, "{today+21}"), fill("textarea", "Sister's graduation"), click("Submit request")]),
    sc("hours", "Specific hours: saat alanları, Add another period", E, path=TO, steps=[fill(START, "{today+20}"), fill("select", "hours")]),
    sc("per-date", "Different hours by date: tarih başına kip", E, path=TO, steps=[fill(START, "{today+20}"), fill(END, "{today+22}"), fill("select", "per_date")]),
    sc("too-long", "31 günden uzun aralık uyarısı", E, path=TO, steps=[fill(START, "{today+20}"), fill(END, "{today+60}")]),
    sc("soon", "24 saatten yakın: This starts soon", E, path=TO, steps=[fill(START, "{today+1}")]),
    sc("started", "Başlamış: This time off has already started", E, path=TO, steps=[fill(START, "{today}")]),
    sc("server-error", "Sunucu reddi: hata satırı", E, path=TO, steps=[fill(START, "{today+20}"), click("Submit request")],
       fail=[{"path": r"/time-off$", "method": "POST", "status": 400, "error": "You already have time off on these dates."}]),
    sc("leave-dialog-timeoff", "İzin taslağı varken sekme değiştir: Discard time off changes?", E, path=TO, steps=[fill(START, "{today+20}"), click("Availability")]),
], part="İzin formu · Request time off")
extend("7.3", [
    sc("cancel-pending", "Bekleyen isteği iptal et: Cancel request (tek tık)", E, path=TO, steps=[click("Cancel request")]),
    sc("decisions", "Onaylı izinler: karar notu, Decision by", E, path=f"{TO}#request-0000070e-0000-4000-8000-00000000070e"),
    sc("released", "Serbest bırakılan vardiya: Entire shift released to open coverage", E, path=f"{TO}#request-00000701-0000-4000-8000-000000000701", setup="hub-released"),
    sc("denied", "Reddedilmiş istek ve yönetici notu", E, path=f"{TO}#request-00000705-0000-4000-8000-000000000705", setup="hub-denied"),
    sc("revoked", "Geri alınmış (Revoked) izin", E, path=f"{TO}#request-0000070e-0000-4000-8000-00000000070e", setup="hub-revoked"),
    sc("cancel-form", "İzin iptal formu: Choose hours → Apply hours", E, path=TO,
       steps=[click("Request leave cancellation"), click("Choose hours for period 1"), click("Apply hours for period 1")]),
    sc("cancel-sent", "İptal isteği gönderildi: Cancellation requested", E, path=TO,
       steps=[click("Request leave cancellation"), click("[aria-label='Cancel period 1']"), click("Send cancellation request")]),
    sc("cancel-invalid", "İptal formu doğrulama: dönem seçilmedi", E, path=TO, steps=[click("Request leave cancellation")]),
    sc("cancel-waiting", "İptal bekliyor: Withdraw cancellation request", E, path=TO, setup="hub-pending-cancel"),
    sc("partly-cancelled", "Kısmen iptal edilmiş izin: Cancelled leave + kalan onaylı gün", E, path=f"{TO}#request-0000070e-0000-4000-8000-00000000070e", setup="hub-partial-cancel"),
    sc("cancel-stale", "Onaylı izin değişti (409): The approved leave changed", E, path=TO,
       steps=[click("Request leave cancellation"), click("[aria-label='Cancel period 1']"), click("Send cancellation request")],
       fail=[{"path": r"/cancellation$", "method": "POST", "status": 409, "reason": "time_off.changed", "error": "stale time off revision"}]),
    sc("cancel-request-stale", "Bekleyeni iptal ederken değişti (409): This request changed", E, path=TO, steps=[click("Cancel request")],
       fail=[{"path": r"/request-action$", "method": "POST", "status": 409, "reason": "time_off.changed", "error": "stale time off revision"}]),
    sc("no-requests", "Hiç istek yok: No time off requests submitted yet.", E, path=TO, setup="hub-no-requests"),
], part="İzin listesi · Time off requests")

# ---------------------------------------------------------------- 7.4 More
set_part("7.4", "Roller", ["employee"])
extend("7.4", [
    sc("owner", "Owner Employee view'da More: Management view satırı", O),
    sc("manager", "Manager Employee view'da More", M),
    sc("no-announce", "announcements.read yok: Announcements satırı yok", E, perms=EMP_NO_ANNOUNCE),
], part="Roller")
extend("7.4", [
    sc("unknown", "Tanınmayan alt yol: Employee Hub başlığıyla aynı sayfa", E, path="/app/employee-hub/foo"),
], part="Sayfa durumları")
page("7.4")["via"] = r"^/app/employee-hub/foo/?$"

# ---------------------------------------------------------------- 8.0 Announcements
ANN = r"/communications/announcements$"
LOC_FILTER = "[aria-label='Filter announcements by location']"
ANN_SEARCH = "[aria-label='Search announcements']"
# The redirect of a role without announcements.read lands on the employee's home.
page("8.0")["via"] = r"^/app/employee-hub/?$"
set_part("8.0", "Roller", ["owner", "manager", "employee"])
set_part("8.0", "Sekmeler ve süzgeçler · Status, filters", ["drafts"])
replace("8.0", "new", sc("new", "Yeni duyuru çekmecesi", O, [click("New announcement")], part="Yeni duyuru ve sonuç satırı · New announcement"))
extend("8.0", [
    sc("scheduled", "Scheduled sekmesi: zamanlanmış duyuru (amber)", O, [click("Scheduled")]),
    sc("published", "Published sekmesi", O, [click("Published")]),
    sc("archived", "Archived sekmesi: arşivlenmiş duyuru", O, [click("Archived")]),
    sc("location", "Lokasyon süzgeci: Downtown", O, [fill(LOC_FILTER, DOWNTOWN)]),
    sc("search", "Arama: menu", O, [fill(ANN_SEARCH, "menu")]),
    sc("reader-filter", "Çalışan: lokasyon süzgeci ve arama", E, [fill(LOC_FILTER, DOWNTOWN), fill(ANN_SEARCH, "cooler")]),
    sc("sort", "Sütun sıralama: Publish date", O, [click("Publish date")]),
    sc("sort-desc", "Sütun sıralama: Announcement, ters sıra", O, [click("Announcement"), click("Announcement")]),
    sc("no-match", "Süzgeçle sonuç yok: No matching announcements", O, [fill(ANN_SEARCH, "zzz")]),
], part="Sekmeler ve süzgeçler · Status, filters")
extend("8.0", [
    sc("row-menu", "Satır menüsü açık: Edit announcement, Archive", O, [click("Actions for Holiday time-off requests are open")]),
    sc("row-menu-reader", "Çalışanın satır menüsü: View announcement", E, [click("Actions for Walk-in cooler repair on Tuesday")]),
], part="Satır menüsü · Actions")
extend("8.0", [
    sc("ack", "Satırdan Acknowledge: onay tiki", E, [click("Acknowledge")]),
    sc("ack-again", "Metin onaydan sonra değişti: Acknowledge again (amber)", E, setup="hub-ack-again"),
], part="Okur onayı · Acknowledge")
extend("8.0", [
    sc("saved", "Taslak kaydedildi: Announcement saved as a draft.", O, [click("New announcement"),
        fill("input[placeholder='What is the update about?']", "Staff meal moves to 3:30 PM"),
        fill("textarea[placeholder='Share the details your team needs.']", "Starting Monday, family meal is at 3:30 PM before dinner service."),
        click("Save draft")]),
], part="Yeni duyuru ve sonuç satırı · New announcement")
extend("8.0", [
    sc("empty", "Hiç duyuru yok: No announcements yet", O, setup="hub-no-announcements"),
    sc("empty-reader", "Çalışan, hiç duyuru yok", E, setup="hub-no-announcements"),
    sc("loading", "Yükleniyor: Loading announcements...", O, hold=[ANN]),
    sc("error", "Okuma hatası satırı", O, fail=[{"path": ANN, "method": "GET", "status": 500, "error": "Announcements couldn't be loaded. Try again."}]),
    sc("no-access", "API reddi: You don't have access to announcements", E, fail=[{"path": ANN, "method": "GET", "status": 403, "reason": "authz.out_of_scope", "error": "Not allowed"}]),
    sc("no-permission", "announcements.read yok: Home'a yönlendirilir", E, perms=EMP_NO_ANNOUNCE),
], part="Sayfa durumları")

# ---------------------------------------------------------------- 8.1 Announcement detail
# The list behind the drawer, and the reader's "Open related page" (the employee's home).
page("8.1")["via"] = r"^/app/announcements/?$|^/app/employee-hub/?$"
TITLE = "input[placeholder='What is the update about?']"
BODY = "textarea[placeholder='Share the details your team needs.']"
def edit(title, view=False):
    return [click(f"Actions for {title}"), click("View announcement" if view else "Edit announcement")]
WINTER = edit("Winter uniform update")
set_part("8.1", "Roller", ["employee", "owner", "manager"])
extend("8.1", [
    sc("new-saved", "Yeni taslak kaydet: Announcement saved as a draft.", O, [click("New announcement"),
        fill(TITLE, "Staff meal moves to 3:30 PM"), fill(BODY, "Starting Monday, family meal is at 3:30 PM before dinner service."), click("Save draft")]),
    sc("manager-new", "Manager yeni duyuru: kendi lokasyonu seçili gelir", M, [click("New announcement")]),
    sc("publish", "Taslağı yayınla: Published for N recipients.", O, WINTER + [click("Publish")]),
    sc("unsaved", "Değişiklik varken Publish kapalı: Save your changes before publishing.", O, WINTER + [fill(TITLE, "Winter uniform update: new aprons")]),
    sc("validation", "Boş başlık: Save changes kapalı, neden yazmaz", O, WINTER + [fill(TITLE, "")]),
    sc("validation-dates", "Expires, Publish'ten önce: Save changes kapalı, neden yazmaz", O, WINTER + [
        fill("label=Publish at", "{today+20}T10:00"), fill("label=Expires at", "{today+19}T10:00")]),
], part="Yazma ve yayın · Edit announcement")
extend("8.1", [
    sc("audience", "Hedef kitle: Locations seçicisi açık", O, WINTER + [click("Locations", within="[aria-label='Audience']"), {"scroll": ".announcement-audience-picker[open]"}]),
    sc("audience-search", "Jobs seçicisi: arama (6'dan fazla seçenek)", O, WINTER + [click("Jobs", within="[aria-label='Audience']"), fill("[aria-label='Search jobs']", "ser"), {"scroll": ".announcement-audience-picker[open]"}]),
    sc("audience-none", "Seçicide arama sonuçsuz: No matches", O, WINTER + [click("Jobs", within="[aria-label='Audience']"), fill("[aria-label='Search jobs']", "zzz"), {"scroll": ".announcement-audience-picker[open]"}]),
    sc("archived-selection", "Silinmiş job seçili: Archived selection", O, edit("Hartwell buyout: staffing") + [click("Jobs", within="[aria-label='Audience']"), {"scroll": ".announcement-audience-picker[open]"}], setup="hub-archived-selection"),
], part="Hedef kitle · Audience")
extend("8.1", [
    sc("archive", "Archive → Confirm archive: Announcement archived.", O, edit("Holiday time-off requests are open") + [click("Archive"), click("Confirm archive")]),
    sc("archive-row", "Satır menüsünden Archive: Confirm archive hazır gelir (3 sn sonra söner)", O, [click("Actions for Holiday time-off requests are open"), click("Archive")]),
    sc("archived-view", "Arşivlenmiş duyuru: salt okunur, Archive yok", O, [click("Archived"), click("Actions for Summer patio hours"), click("View announcement")]),
], part="Arşivleme · Archive")
extend("8.1", [
    sc("manager-other", "Manager başkasının duyurusunu görüyor: salt okunur + Acknowledge", M, edit("Holiday time-off requests are open", view=True)),
    sc("related", "Okur: Open related page düğmesi", E, edit("Holiday time-off requests are open", view=True)),
    sc("related-open", "Open related page: bağlı sayfaya gider (Home)", E, edit("Holiday time-off requests are open", view=True) + [click("Open related page")]),
    sc("reader-ack", "Okur çekmeceden onaylar: tik", E, edit("Walk-in cooler repair on Tuesday", view=True) + [click("Acknowledge")]),
    sc("reader-again", "Metin değişti: Updated. Please acknowledge the new version.", E, edit("Walk-in cooler repair on Tuesday", view=True), setup="hub-ack-again"),
], part="Okur görünümü · Announcement")
extend("8.1", [
    sc("conflict-changed", "409: başkası değiştirdi", O, edit("Thanksgiving prix fixe menu") + [fill(TITLE, "Thanksgiving prix fixe: $68"), click("Save changes")],
       fail=[{"path": ANN, "method": "POST", "status": 409, "reason": "announcement.changed", "error": "stale revision"}]),
    sc("conflict-archived", "409: arşivlenmiş, düzenlenemez", O, edit("Thanksgiving prix fixe menu") + [fill(TITLE, "Thanksgiving prix fixe: $68"), click("Save changes")],
       fail=[{"path": ANN, "method": "POST", "status": 409, "reason": "announcement.archived", "error": "archived"}]),
    sc("unknown", "Bilinmeyen id: This announcement is no longer available.", O, path=f"/app/announcements/{NO_SHIFT}"),
], part="Hatalar · Errors")

# ---------------------------------------------------------------- 9.0 Notifications
NOTI = r"/communications/notifications$"
CATEGORY = "[aria-label='Notification category']"
TOM = "Time-off request from Tom Becker"
# A notice's own page opens inside this one (the employee's pages, the account's security page).
page("9.0")["via"] = r"^/app/employee-hub(/(shift-hub|my-availability|schedule))?/?$|^/account/security/?$"
set_part("9.0", "Roller", ["owner", "manager", "employee"])
set_part("9.0", "Sekmeler ve süzgeç · Unread, Read, category", ["read"])
extend("9.0", [
    sc("category", "Kategori süzgeci: Requests", O, [fill(CATEGORY, "requests")]),
    sc("category-empty", "Süzgeçle boş: No unread notifications", O, [fill(CATEGORY, "payroll")]),
], part="Sekmeler ve süzgeç · Unread, Read, category")
extend("9.0", [
    sc("select-one", "Tek satır seçili: 1 selected + Mark as read", O, [click(f"[aria-label='Select {TOM}']")]),
    sc("mark-read", "Seçileni okundu yap: Read sekmesine geçer", O, [click(f"[aria-label='Select {TOM}']"), click("Mark as read")]),
    sc("mark-unread", "Read sekmesinde hepsini seç + Mark as unread", O, [click("Read ("), click("[aria-label='Select all shown notifications']"), click("Mark as unread")]),
    sc("dismiss", "Dismiss: çöp kutusu, tek tık", O, [click(f"[aria-label='Dismiss {TOM}']")]),
    sc("action-error", "İşlem hatası satırı", O, [click(f"[aria-label='Select {TOM}']"), click("Mark as read")],
       fail=[{"path": r"/notifications/action$", "method": "POST", "status": 500, "error": "Notifications couldn't be updated. Try again."}]),
], part="Seçim ve toplu işlem · Mark as read, Dismiss")
extend("9.0", [
    sc("open-target", "Başlığa tıkla: bildirimin sayfası açılır, bildirim okunur", E, [click("Ethan offered to take your shift")]),
    sc("security", "Hesap bildirimi: Security sayfasına gider", E, [click("Read ("), click("New sign-in to your account")]),
], part="Bildirim bağlantıları · Open notification")
extend("9.0", [
    sc("shift-details", "Çalışan: View shift details paneli", E, [click("View shift details")]),
    sc("shift-details-manager", "Manager: View shift details paneli + Open schedule", M, [click("View shift details")]),
    sc("shift-details-error", "Panel yüklenemedi: Try again", E, [click("View shift details")],
       fail=[{"path": r"/shift-exchanges", "method": "GET", "status": 500}]),
], part="Vardiya ayrıntısı · Shift request details")
extend("9.0", [
    sc("load-more", "30'dan fazla bildirim: Load more", O, [click("Load more"), {"wait": 600}, {"scroll": ".notification-load-more"}], setup="hub-many-notices"),
    sc("loading", "Yükleniyor: Loading notifications...", O, hold=[NOTI]),
    sc("error", "Okuma hatası", O, fail=[{"path": NOTI, "method": "GET", "status": 500, "error": "Notifications couldn't be loaded. Try again."}]),
    sc("empty", "Hiç bildirim yok: No unread notifications", O, setup="hub-no-notices"),
    sc("no-access", "API reddi: You don't have access to notifications", E, fail=[{"path": NOTI, "method": "GET", "status": 403, "reason": "authz.out_of_scope", "error": "Not allowed"}]),
], part="Sayfa durumları")

# ---------------------------------------------------------------- 0.x The shell
# The shell is part of every /app page; each 0.x page opens it on the route where
# the part shows best. A control only one frame has (the phone's bottom bar, the
# desktop sidebar) is listed with a harmless twin the other frame clicks instead
# (its page heading), so a step never goes missing in the frame that lacks it.
WS = "/app/workspace"
WS_MATCH = r"^/app/workspace/?$"
EMP_HOME = "/app/employee-hub"
PHONE_MORE = ".mm-bar button[aria-haspopup=dialog], main h1"   # the phone's More; the desktop clicks its heading
SWITCHER = ".workspace-switcher-trigger, main h1"               # the desktop's switcher; the phone clicks its heading
NARROW = ["workspace.read", "schedule.read", "notifications.read"]

add("0.1", "Shell · Sidebar", "workspace", WS, WS_MATCH, [O, M],
    "Masaüstündeki sol menü: workspace adı, role ve izne göre sayfalar (yönetim ve çalışan bölümleri), Notifications sayacı, Settings, Employee view, Account ve Sign out. Menü daraltılıp simge rayına dönebilir; alt grupları (Schedule altında Requests, Employees altında Documents) açılıp kapanır.",
    "Her /app sayfasının solunda (telefonda gizli; yerine alt menü)", "Herkes; içerik role ve izne göre değişir",
    [sc("owner", "Owner menüsü: bütün yönetim sayfaları, Settings, Employee view", O, part="Roller"),
     sc("admin", "Admin menüsü", A, part="Roller"),
     sc("manager", "Manager menüsü", M, part="Roller"),
     sc("employee", "Çalışan menüsü: Home, Schedule, Shift Hub, My Availability", E, path=EMP_HOME, part="Roller"),
     sc("custom", "Özel rol (Shift Lead): yalnız izinli sayfalar", C, path="/app/notifications", part="Roller"),
     sc("narrow", "Dar izinli rol (yalnız Schedule okuma): kısa menü", M, path="/app/notifications", perms=NARROW, part="Roller"),
     sc("collapsed", "Daraltılmış ray: Collapse menu", O, [click("[aria-label='Collapse menu'], main h1")], part="Daraltma · Collapse menu"),
     sc("collapsed-peek", "Rayda öğenin üstüne gelince uçan etiket", O, [click("[aria-label='Collapse menu'], main h1"),
        {"act": "hover", "target": ".app-sidebar [aria-label='Announcements'], main h1"}], part="Daraltma · Collapse menu"),
     sc("group-closed", "Schedule grubu kapalı: Requests gizli", O, [click("[aria-label='Collapse Schedule'], main h1")], part="Daraltma · Collapse menu"),
     sc("badge-many", "Notifications sayacı 99+", O, setup="hub-many-notices", part="Sayaçlar · Badges"),
     sc("account-waiting", "Account satırında bekleyen sayısı (1)", O, part="Sayaçlar · Badges"),
    ])
page("0.1")["via"] = r"^/app/(employee-hub|notifications)/?$"

add("0.2", "Shell · Employee bottom nav", "employee-hub", EMP_HOME, r"^/app/employee-hub/?$", [E],
    "Telefonda çalışanın alt menüsü: Home, Schedule, Requests (Shift Hub) ve More. Menüdeki üç sayfadan biri açık değilse More etkin görünür. Masaüstünde görünmez; orada sol menü vardır.",
    "Telefonda, çalışanın bütün sayfalarının altında", "Çalışan; Employee view'daki owner ve manager",
    [sc("home", "Home etkin", E, part="Alt menü · Employee navigation"),
     sc("schedule", "Schedule etkin", E, path="/app/employee-hub/schedule", part="Alt menü · Employee navigation"),
     sc("requests", "Requests etkin (Shift Hub)", E, path="/app/employee-hub/shift-hub", part="Alt menü · Employee navigation"),
     sc("more", "More etkin: Announcements gibi başka bir sayfada", E, path="/app/announcements", part="Alt menü · Employee navigation"),
     sc("owner-view", "Owner Employee view'da: çalışan kaydı yok, yetkisiz kartı", O, part="Roller"),
     sc("owner-record", "Owner kendi çalışan kaydıyla Employee view'da", O, setup="hub-staff-employee", part="Roller"),
    ])
page("0.2")["via"] = r"^/app/employee-hub/(schedule|shift-hub)/?$|^/app/announcements/?$"

add("0.3", "Shell · Management bottom nav", "workspace", WS, WS_MATCH, [O, M],
    "Telefonda yönetimin alt çubuğu: izinli ilk dört sayfa ve More. More bir sayfa olarak açılır: kalan sayfalar, Settings, Employee view, Account, Sign out ve Close. Esc ya da arka plana dokunma kapatır.",
    "Telefonda, owner ve manager'ın /app sayfalarının altında", "Owner, admin, manager ve yönetim yetkili özel roller",
    [sc("owner", "Owner alt çubuğu", O, part="Roller"),
     sc("manager", "Manager alt çubuğu (daha az öğe)", M, part="Roller"),
     sc("more", "More sayfası açık", O, [click(PHONE_MORE)], part="More sayfası · More"),
     sc("more-manager", "Manager'ın More sayfası", M, [click(PHONE_MORE)], part="More sayfası · More"),
     sc("more-esc", "More açıkken Esc: kapanır", O, [click(PHONE_MORE), {"wait": 300}, {"act": "key", "key": "Escape", "target": "[aria-label='Close'], main h1", "within": "dialog.mm-sheet[open]"}], part="More sayfası · More"),
     sc("more-backdrop", "More açıkken arka plana dokun: kapanır", O, [click(PHONE_MORE), click("[open].mm-sheet, body:not(:has(.mm-sheet[open])) main h1")], part="More sayfası · More"),
     sc("more-close", "More'u Close ile kapat", O, [click(PHONE_MORE), click("[aria-label='Close'], main h1", within="dialog.mm-sheet[open]")], part="More sayfası · More"),
    ])

add("0.4", "Shell · Workspace switcher", "workspace", WS, WS_MATCH, [O, M],
    "Sol menünün başındaki workspace adı. Başka workspace ya da bekleyen davet varsa açılır menü olur: You are in, Switch to listesi (kurulumu bitmeyene Setup unfinished), davetler ve All workspaces. Daraltılmış rayda baş harfe döner.",
    "Masaüstünde sol menünün en üstü", "Birden çok workspace'i ya da daveti olan herkes; tek workspace'te yalnız ad",
    [sc("owner", "Tek workspace, davet yok: yalnız ad", O, part="Roller"),
     sc("manager", "Manager: yalnız ad", M, part="Roller"),
     sc("employee", "Çalışan: yalnız ad", E, path=EMP_HOME, part="Roller"),
     sc("many", "Başka workspace ve davet var: ad + davet sayısı", O, setup="hub-switcher", part="Değiştirici · Workspace switcher"),
     sc("open", "Menü açık: Switch to, Setup unfinished, Invitation, All workspaces", O, [click(SWITCHER)], setup="hub-switcher", part="Değiştirici · Workspace switcher"),
     sc("collapsed", "Daraltılmış rayda baş harf ve davet noktası", O, [click("[aria-label='Collapse menu'], main h1")], setup="hub-switcher", part="Değiştirici · Workspace switcher"),
     sc("answer", "Davete Answer: Workspaces sayfasına gider", O, [click(SWITCHER), click(".workspace-switcher-answer, main h1")], setup="hub-switcher", part="Değiştirici · Workspace switcher"),
     sc("switch-error", "Geçiş hatası: Saltline açılamaz, Workspaces sayfasına gider", O, [click(SWITCHER), click("Saltline Oyster Bar")], setup="hub-switch-fails", part="Değiştirici · Workspace switcher"),
     sc("all", "All workspaces bağlantısı", O, [click(SWITCHER), click(".workspace-switcher-all, main h1")], setup="hub-switcher", part="Değiştirici · Workspace switcher"),
    ])
page("0.4")["via"] = r"^/app/employee-hub/?$|^/workspaces/?$"

add("0.5", "Shell · Account menu", "workspace", WS, WS_MATCH, [O, M],
    "Sol menünün altındaki Account satırı: kişinin resmi ve cevap bekleyen iş sayısı. Ayrı açılır menü yoktur; satır hesap sayfasına gider. Telefonda yönetimde More sayfasında, çalışanda More'da (My account) bulunur.",
    "Masaüstünde sol menünün altı; telefonda More", "Herkes",
    [sc("owner", "Account satırı ve bekleyen sayısı", O, part="Roller"),
     sc("manager", "Manager'ın Account satırı", M, part="Roller"),
     sc("employee", "Çalışanın Account satırı", E, path=EMP_HOME, part="Roller"),
     sc("photo", "Fotoğraflı kişi: Account satırında resim", E, path=EMP_HOME, setup="account-avatar", part="Account satırı · Account"),
     sc("collapsed", "Daraltılmış rayda yalnız resim ve sayı", O, [click("[aria-label='Collapse menu'], main h1")], part="Account satırı · Account"),
     sc("phone-more", "Telefonda More'daki Account", O, [click(PHONE_MORE)], part="Account satırı · Account"),
    ])
page("0.5")["via"] = r"^/app/employee-hub/?$"

add("0.6", "Shell · Employee view", "workspace", WS, WS_MATCH, [O, M],
    "Yöneticinin çalışan gözüyle bakması: sol menüde (telefonda More'da) Employee view. Açılınca kabuk çalışan kabuğuna döner (çalışan menüsü, Settings gizli) ve aynı yerde Management view ile geri dönülür. Çalışan kaydı olmayan yönetici yetkisiz kartını görür.",
    "Sol menüde Account'un üstü; telefonda More", "Employee Hub izni olan owner, admin ve manager",
    [sc("owner", "Owner: sol menüde Employee view", O, part="Roller"),
     sc("manager", "Manager: Employee view", M, [click(PHONE_MORE), click("Employee view")], part="Roller"),
     sc("no-record", "Çalışan kaydı yok: You don't have access to Employee Hub", O, [click(PHONE_MORE), click("Employee view")], part="Geçiş · Employee view"),
     sc("record", "Çalışan kaydıyla: çalışan kabuğu, Management view", O, [click(PHONE_MORE), click("Employee view")], setup="hub-staff-employee", part="Geçiş · Employee view"),
     sc("back", "Management view ile yönetime dönüş", O, path=EMP_HOME, steps=[click(".eh-mobile-nav a[href$='/more'], main h1"), click("Management view")], setup="hub-staff-employee", part="Geçiş · Employee view"),
    ])
page("0.6")["via"] = r"^/app/employee-hub(/more)?/?$"

add("0.7", "Shell · Common states", "workspace", WS, WS_MATCH, [O, M],
    "Her sayfanın paylaştığı durumlar: workspace yüklenirken boş sayfa, workspace okunamadı, kurulumu bitmemiş workspace (Almost ready), belge kapısı, ortak yetkisiz kartı, telefonda kapalı Schedule, izinsiz ya da bilinmeyen adresin sessiz yönlendirmesi ve oturumun düşmesi.",
    "Her /app sayfasında, sayfa açılmadan önce ya da yerine", "Herkes",
    [sc("owner", "Owner: normal açılış", O, part="Roller"),
     sc("manager", "Manager: normal açılış", M, part="Roller"),
     sc("loading", "Workspace yükleniyor: boş sayfa", O, hold=[r"^/v1/context$"], part="Yükleme ve hata · Loading"),
     sc("context-error", "That workspace didn't load + Try again", O, fail=[{"path": r"^/v1/context$", "method": "GET", "status": 500}], part="Yükleme ve hata · Loading"),
     sc("setup-pending", "Kurulumu bitmemiş workspace: Almost ready + Check again", E, path=EMP_HOME, setup="hub-setup-pending", part="Yükleme ve hata · Loading"),
     sc("setup-choose", "Almost ready → Choose a workspace: emekli adrese gider, Workspaces'a düşer", E, path=EMP_HOME, setup="hub-setup-pending", steps=[click("Choose a workspace")], part="Yükleme ve hata · Loading"),
     sc("session-lost", "Oturum düştü (401): giriş ekranına, süresi doldu mesajıyla", O, fail=[{"path": r"/documents/access$", "status": 401, "error": "Session expired"},
                 {"path": r"^auth/getUser$", "status": 401, "reason": "session_not_found", "error": "Session not found"}], part="Oturum · Session"),
     sc("documents-gate", "Belge kapısı: eksik belgeli çalışan Documents'a yönlendirilir", E, path=EMP_HOME, setup="hub-documents-restricted", part="Belge kapısı · Documents"),
     sc("documents-error", "Belge erişimi denetlenemedi + Try again", E, path=EMP_HOME, fail=[{"path": r"/documents/access$", "method": "GET", "status": 500}], part="Belge kapısı · Documents"),
     sc("no-access", "Ortak yetkisiz kartı (API reddi)", E, path=EMP_HOME, fail=[{"path": HUB, "method": "GET", "status": 403, "reason": "authz.out_of_scope"}], part="Yetki · Access"),
     sc("forbidden-route", "İzinsiz adres: sessizce kendi ana sayfasına", E, path="/app/employees", part="Yetki · Access"),
     sc("unknown-route", "Bilinmeyen adres (/app/xyz): rolün açılış sayfasına", O, path="/app/xyz", part="Yetki · Access"),
     sc("phone-schedule", "Telefonda Schedule kapalı: Schedule is available on a computer.", O, path="/app/schedule", part="Yetki · Access"),
    ])
page("0.7")["via"] = r"^/app/employee-hub/?$|^/app/(employees|xyz|schedule)/?$|^/app/?$|^/sign-in/?$|^/account/documents/?$|^/(organization-switcher|workspaces)/?$"

add("0.8", "Shell · Toaster and confirm dialog", "requests", "/app/schedule/requests", r"^/app/schedule/requests/?$", [O],
    "Ortak geri bildirim katmanları: ekranın altında kısa bildirim (toast; en çok üç, altı saniye, kapat düğmesiyle) ve onay penceresi (başlık, açıklama, beyaz Cancel, yeşil ya da kırmızı onay; Esc ve arka plan Cancel sayılır, kayıt sürerken onay kapalı).",
    "Her sayfanın üstünde, bir işlem sonucu ya da çıkış onayı gerektiğinde", "Herkes",
    [sc("toast", "Başarı toast'u, çekmece kapandıktan sonra: Removed from Harbor & Vine Downtown", M,
        path="/app/employees?employeeId=00000601-0000-4000-8000-000000000601&section=employment",
        steps=[click("Remove from Harbor & Vine Downtown"), click("Confirm remove from Harbor & Vine Downtown")], part="Toast · Toaster"),
     sc("confirm", "Onay penceresi (yeşil): Approve time off?", O, [click("[aria-label^=\"Ethan Brooks, Time off\"]"), click("text=Approve", within=".requests-review-drawer, .catalog-drawer[role=\"dialog\"]"), {"wait": 400}], part="Onay penceresi · ConfirmDialog"),
     sc("confirm-danger", "Yıkıcı onay (kırmızı): Discard availability changes?", E, path="/app/employee-hub/my-availability",
        steps=[click("Add hours on Monday"), click("Home")], part="Onay penceresi · ConfirmDialog"),
     sc("confirm-esc", "Esc = Stay here: pencere kapanır, değişiklik kalır", E, path="/app/employee-hub/my-availability",
        steps=[click("Add hours on Monday"), click("Home"), {"wait": 300}, {"act": "key", "key": "Escape", "target": ".app-confirm"}], part="Onay penceresi · ConfirmDialog"),
     sc("confirm-busy", "Kayıt sürerken: Saving availability, onay kapalı", E, path="/app/employee-hub/my-availability",
        steps=[click("Add hours on Monday"), click("Save"), {"wait": 300}, click("Home")], hold=[r"POST /availability/weekly$"], part="Onay penceresi · ConfirmDialog"),
    ])
page("0.8")["via"] = r"^/app/employees/?$|^/app/employee-hub(/my-availability)?/?$"
