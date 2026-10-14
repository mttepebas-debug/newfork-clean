# Settings (10.0–10.12, except 10.6 Shift catalog): every part of each page,
# its empty, error and role states. Setups: mock/settings-setups.ts.
def scroll(sel): return {"scroll": sel}
def upload(sel, name, type, size=None):
    d = {"file": sel, "name": name, "type": type}
    if size: d["size"] = size
    return d
def err(path, status=500, method="GET", reason=None, error=None):
    d = {"path": path, "method": method, "status": status}
    if reason: d["reason"] = reason
    if error: d["error"] = error
    return d
# Shift Lead's own permissions (mock/access.ts); custom scenarios add Settings keys to them.
SL = ["workspace.read", "schedule.read", "schedule.manage", "employees.read", "availability.read",
      "schedule.time_off_requests.read", "schedule.shift_change_requests.read", "schedule.shift_change_requests.manage",
      "announcements.read", "notifications.read", "notifications.read_own", "notifications.preferences.write_own"]
# Every permission key an admin holds (packages/shared permissionsForRole("admin")).
ADMIN_ALL = ["availability.read", "availability.manage", "schedule.templates.read", "employee_access.read", "employees.private.read",
             "employees.private.manage", "employee_documents.read", "important_dates.read", "important_dates.manage",
             "settings.general.read", "settings.general.manage", "settings.locations.read", "settings.locations.manage",
             "settings.jobs.read", "settings.jobs.manage", "settings.shift_catalog.read", "settings.shift_catalog.manage",
             "settings.schedule_rules.read", "settings.schedule_rules.manage", "workspace.read", "workspace.manage",
             "schedule.read", "schedule.manage", "schedule.conflict_rules.manage", "schedule.publish", "schedule.templates.manage",
             "schedule.export", "schedule.time_off_requests.read", "schedule.time_off_requests.manage",
             "schedule.shift_change_requests.read", "schedule.shift_change_requests.manage", "roles.read", "roles.manage",
             "documents.read", "documents.manage", "employees.read", "employees.manage", "employees.archive",
             "employee_access.manage", "employee_onboarding.review", "employee_documents.review", "announcements.read",
             "announcements.manage", "notifications.read", "notifications.read_own", "notifications.preferences.write_own",
             "notifications.settings.read", "notifications.settings.write", "notifications.test_send",
             "notifications.delivery_audit.read", "notifications.dlq.replay", "notifications.broadcast.approve"]
def armed(steps):
    """Two-click buttons disarm after 3.2 s: the last click (the arming one) waits so the check's picture catches it armed."""
    n = len(steps) + 1
    waits = sum(x.get("wait", 0) for x in steps)
    return steps[:-1] + [{"wait": max(0, 400 + 750 * n - waits)}, steps[-1]]
def admin_without(*keys): return [k for k in ADMIN_ALL if k not in keys]
READ_SETTINGS = ["settings.general.read", "settings.jobs.read", "settings.shift_catalog.read", "settings.schedule_rules.read",
                 "notifications.settings.read", "documents.read"]
LANDINGS = r"^/app(/(workspace|employee-hub))?/?$"

# ---------- 10.0 General + the Settings menu (SettingsLayout) ----------
page("10.0")["via"] = r"^/app(/(workspace|employee-hub|important-dates|announcements/important-dates))?/?$|^/app/settings(/(important-dates(/closed-days)?|closed-days))?/?$"
set_part("10.0", "Genel bilgiler · General", ["owner"])
set_part("10.0", "Kurulum listesi ve tercih edilen adlar · Setup checklist, Preferred names", ["checklist"])
LOGO_INPUT = 'input[aria-label="Upload schedule logo file"]'
extend("10.0", [
    sc("logo-empty", "Logo penceresi: logo yok, kaydırıcılar kapalı", O, [click("Manage logo")]),
    sc("logo-upload", "Logo seçildi: önizleme, kaydırıcılar açık, Remove var", O, [click("Manage logo"), upload(LOGO_INPUT, "harbor-vine-logo.png", "image/png")]),
    sc("logo-type", "Yanlış dosya türü: \"Use an SVG, PNG, JPEG, or WebP image.\"", O, [click("Manage logo"), upload(LOGO_INPUT, "menu.pdf", "application/pdf")]),
    sc("logo-size", "5 MB'tan büyük logo: \"Logo must be 5 MB or smaller.\"", O, [click("Manage logo"), upload(LOGO_INPUT, "big-logo.png", "image/png", 6 * 1024 * 1024)]),
    sc("logo-existing", "Logolu workspace: pencerede mevcut logo ve son güncelleme", O, [click("Manage logo")], setup="settings-logo"),
    sc("logo-remove", "Remove: \"Logo will be removed\"", O, [click("Manage logo"), click("Remove", within=".schedule-logo-dialog")], setup="settings-logo"),
    sc("logo-saved", "Logo kaydedildi: sayfadaki çerçevede logo, \"Workspace settings saved.\"", O,
       [click("Manage logo"), upload(LOGO_INPUT, "harbor-vine-logo.png", "image/png"), click("Save", within=".schedule-logo-dialog"), {"wait": 600}]),
], part="Logo penceresi · Schedule logo")
NAME = "#organization-name"
extend("10.0", [
    sc("name-saved", "Ad değişti ve kaydedildi: \"Workspace settings saved.\"", O, [fill(NAME, "Harbor & Vine Group"), click("Save changes"), {"wait": 500}]),
    sc("name-letters", "ABD harf kuralı: \"English letters only.\", Save kapalı", O, [fill(NAME, "Café Çınar")]),
    sc("name-empty", "Ad boş: Save kapalı", O, [fill(NAME, "")]),
    sc("name-refused", "Kayıt reddi: \"your role can't change it\" (rolün yetkisi sayfa açıkken alındı)", A,
       [fill(NAME, "Harbor & Vine Group"), click("Save changes"), {"wait": 500}], setup="settings-name-refused"),
], part="Workspace adı · Workspace name")
extend("10.0", [
    sc("preferred-auto", "Preferred names: \"Used as soon as it is entered\" (Let them through)", O, [click("Let them through")]),
    sc("checklist-error", "Kurulum listesi kaydedilemedi: \"Setup checklist visibility could not be saved.\"", O, [{"wait": 1200}, click("Hide checklist"), {"wait": 500}], fail=[err(r"/workspace/setup-checklist$", method="PATCH")]),
    sc("preferred-error", "Preferred names kaydedilemedi: \"That setting could not be saved.\"", O, [click("Let them through")],
       fail=[err(r"/preferred-name-approval$", method="PUT")]),
], part="Kurulum listesi ve tercih edilen adlar · Setup checklist, Preferred names")
extend("10.0", [
    sc("checklist-loading", "Kurulum listesi ayarı yükleniyor: gri çizgi, düğme kapalı", O, hold=[r"/workspace/setup-checklist$"]),
    sc("checklist-read-error", "Kurulum listesi ayarı okunamadı: This setting didn't load. Nothing was changed. + Try again, düğme kapalı", O,
       fail=[err(r"/workspace/setup-checklist$")]),
    sc("preferred-read-error", "Preferred names ayarı okunamadı: This setting didn't load. Nothing was changed. + Try again", O,
       fail=[err(r"/preferred-name-approval$")]),
    sc("checklist-no-access", "Erişim yok: You don't have access to this setting., düğme kapalı", O, fail=[err(r"/workspace/setup-checklist$", 403)]),
], part="Sayfa durumları")
extend("10.0", [
    sc("menu-home", "/app/settings: ilk açık sayfaya (General) gider", O, path="/app/settings"),
    sc("menu-custom", "Özel rol, yalnız okuma izinleri: menüde açık sekmeler (Locations, Conflict handling, Roles yok)", C,
       perms=SL + READ_SETTINGS),
    sc("menu-manager", "Manager Settings'e giremez: aynı adreste erişim kartı (You don't have access to Settings), ana menüde Settings yok", M),
    sc("menu-employee", "Employee Settings'e giremez: aynı adreste erişim kartı (You don't have access to Settings)", E),
    sc("menu-important-dates", "Eski adres /app/settings/important-dates: Announcements → Important Dates'e gider", O, path="/app/settings/important-dates"),
    sc("menu-closed-days", "Eski adres /app/settings/closed-days: Announcements → Important Dates'e gider", O, path="/app/settings/closed-days"),
], part="Ayar menüsü · Settings menu")
extend("10.0", [
    sc("admin", "Admin · Daniel Brooks: owner ile aynı menü ve düğmeler", A),
    sc("admin-checklist", "Admin kurulum listesini gizler: \"Hidden from Workspace\"", A, [{"wait": 1200}, click("Hide checklist"), {"wait": 400}]),
    sc("custom-readonly", "Özel rol (settings.general.read): bütün düğmeler ve ad alanı kapalı", C, perms=SL + ["settings.general.read"]),
], part="Roller")

# ---------- 10.1 Locations ----------
set_part("10.1", "Liste · Active / Archived", ["owner", "archived"])
set_part("10.1", "Lokasyon çekmecesi · New / Edit location", ["new", "edit"])
LOCF = ".location-catalog-fields > div:nth-of-type({}) input"
def loc_field(n, value): return fill(LOCF.format(n), value)
EDIT_DT = [click("Actions for Harbor & Vine Downtown"), click("Edit location")]
EDIT_UP = [click("Actions for Harbor & Vine Uptown"), click("Edit location")]
SAVE_LOC = click("Save location")
extend("10.1", [
    sc("archived-list", "Arşiv dolu: Seaport", O, [click("Archived")], setup="settings-archived"),
    sc("archived-menu", "Seaport satır menüsü: Restore (tek satırlı tabloda menü kesiliyor)", O, [click("Archived"), click("Actions for Harbor & Vine Seaport")], setup="settings-archived"),
    sc("no-match", "Arama sonuç yok: \"No locations match your search.\"", O, [fill('input[aria-label="Search locations"]', "zzz")]),
    sc("sorted", "Address'e göre sıralı (aynı başlığa üçüncü tık ada göre sıraya döner)", O, [click("Address", within=".job-catalog")]),
    sc("archive-confirm", "Archive iki tık: \"Confirm archive\" (son satırda menü tablonun içinde kesiliyor)", O, armed([click("Actions for Harbor & Vine Uptown"), click("Archive")])),
    sc("empty", "Hiç lokasyon yok: \"No locations yet\"", O, setup="settings-no-locations"),
    sc("loading", "Yükleniyor: tablonun gri satırları (Loading locations)", O, hold=[r"/settings/locations$"]),
    sc("read-error", "Liste okunamadı: We couldn't load locations + Try again (sunucunun cümlesi görünmez)", O, fail=[err(r"/settings/locations$")]),
    sc("denied", "API reddi: \"You don't have access to Locations\"", O, fail=[err(r"/settings/locations$", 403)]),
], part="Liste · Active / Archived")
extend("10.1", [
    sc("zip-suggest", "ZIP 02110: saat dilimi önerisi", O, [click("New location"), loc_field(7, "02110"), {"wait": 900}]),
    sc("zip-none", "ZIP 00000: \"No clear suggestion\"", O, [click("New location"), loc_field(7, "00000"), {"wait": 900}]),
    sc("short-error", "Short name biçim hatası", O, EDIT_DT + [loc_field(2, "A"), SAVE_LOC]),
    sc("phone-error", "Telefon 10 hane değil: \"Enter a 10-digit US phone number.\"", O, EDIT_DT + [fill('input[aria-label="Phone number"]', "555"), SAVE_LOC]),
    sc("letters-error", "Harf kuralı: City \"Zürich\"", O, EDIT_DT + [loc_field(5, "Zürich"), SAVE_LOC]),
    sc("short-taken", "Short name kullanılıyor: Uptown'a \"DTWN\"", O, EDIT_UP + [loc_field(2, "DTWN"), SAVE_LOC, {"wait": 400}]),
    sc("name-taken", "Ad kullanılıyor: Uptown'a Downtown'un adı (ham veritabanı metni)", O, EDIT_UP + [loc_field(1, "Harbor & Vine Downtown"), SAVE_LOC, {"wait": 400}]),
    sc("saved", "Yeni lokasyon kaydedildi: çekmece kapandı, Back Bay listede", O, [click("New location"),
       loc_field(1, "Harbor & Vine Back Bay"), loc_field(2, "BKBY"), loc_field(4, "500 Boylston Street"), loc_field(5, "Boston"),
       loc_field(6, "MA"), loc_field(7, "02116"), {"wait": 900}, SAVE_LOC, {"wait": 600}]),
    sc("delete", "Delete location iki tık: \"Confirm delete\"", O, armed(EDIT_UP + [click("Delete location")])),
    sc("gone", "Başkası silmiş: arşivlerken \"This location was deleted\", satır listeden düşer", O,
       [click("Actions for Harbor & Vine Uptown"), click("Archive"), click("Confirm archive"), {"wait": 500}], setup="settings-location-gone"),
], part="Lokasyon çekmecesi · New / Edit location")
extend("10.1", [
    sc("admin-readonly", "Admin yalnız okuma (settings.locations.manage yok): New location ve satır menüsü yok, alanlar kapalı", A,
       [click("Harbor & Vine Downtown", within=".job-catalog")], perms=admin_without("settings.locations.manage")),
], part="Roller")

# ---------- 10.2 Jobs ----------
# Jobs V1 and Mert's ten Jobs decisions (2026-10-13/14): Jobs / Departments /
# Archived tabs, one table with a sub-heading per department, always open.
set_part("10.2", "Liste · Jobs / Departments / Archived", ["owner"])
set_part("10.2", "Departman ve job ekleme · Add", ["addjob"])
set_part("10.2", "Job çekmecesi · Employees", ["people"])
NO_JOB = "/app/settings/jobs?jobId=00000399-0000-4000-8000-000000000399"
BARTENDER = [click("Bartender", within=".job-catalog")]
DRAWER = ".catalog-drawer"
def tab(name): return click(name, within='[role=tablist][aria-label="Jobs and departments"]')
extend("10.2", [
    sc("departments", "Departments sekmesi: Department · Jobs · Employees", O, [tab("Departments")]),
    sc("show-jobs", "Departments → Bar'ın job sayısı: Jobs sekmesi Bar'a süzülür", O, [tab("Departments"), click("button[aria-label^='Show the'][aria-label$='in Bar']")]),
    sc("filter", "Department süzgeci: Kitchen", O, [fill('select[aria-label="Filter by department"]', "00000202-0000-4000-8000-000000000202")]),
    sc("sorted", "Employees'e göre sıralı (departman içinde)", O, [click(".jobs-job-row [role=columnheader]:nth-child(2) button")]),
    sc("no-match", "Arama sonuç yok: \"No jobs match your search.\"", O, path="/app/settings/jobs?q=zzz"),
    sc("archived", "Archived sekmesi: Departments ve Jobs iki grupta, Restore tek tık", O, path="/app/settings/jobs?tab=archived", setup="settings-archived"),
    sc("archived-empty", "Arşiv boş: \"No archived departments or jobs\"", O, [tab("Archived")]),
    sc("no-department", "\"No department\" grubu (Expo)", O, [scroll('[aria-label="No department"]')], setup="settings-archived"),
    sc("empty", "Hiç departman ve job yok: \"No jobs yet\"", O, setup="settings-no-jobs"),
    sc("gone-job", "Adresteki job yok: \"This job is no longer available. Dismiss\"", O, path=NO_JOB),
    sc("loading", "Yükleniyor: gri iskelet", O, hold=[r"/settings/jobs$"]),
    sc("read-error", "Liste okunamadı: Try again", O, fail=[err(r"/settings/jobs$")]),
    sc("counts-error", "Çalışan sayıları yüklenemedi: sayılar sessizce \"—\", uyarı yok", O, fail=[err(r"/organization/job-counts$")]),
    sc("denied", "API reddi: \"You don't have access to Jobs\"", O, fail=[err(r"/settings/jobs$", 403)]),
], part="Liste · Jobs / Departments / Archived")
extend("10.2", [
    sc("new-job", "New job çekmecesi (çalışan listesiyle)", O, [click("button[aria-label='New job']")]),
    sc("new-department", "Departments → New department", O, [tab("Departments"), click("button[aria-label='New department']")]),
    sc("edit-department", "Kitchen'ı düzenle", O, [click("Actions for Kitchen"), click("Edit department")]),
    sc("dup-name", "Aynı ad: yeni job \"Server\"", O, [click("button[aria-label='New job']"), fill("#edit-job-name", "Server"),
       click("Save", within=DRAWER), {"wait": 500}]),
    sc("letters", "Harf kuralı: departman adı \"Café\"", O, [tab("Departments"), click("button[aria-label='New department']"), fill("#catalog-entity-name", "Café")]),
    sc("letters-job", "Harf kuralı: job adı \"Garçon\" kaydedilirken", O, [click("button[aria-label='New job']"), fill("#edit-job-name", "Garçon"),
       click("Save", within=DRAWER), {"wait": 400}]),
], part="Departman ve job ekleme · Add")
extend("10.2", [
    sc("pending", "Atama bekliyor: \"1 to assign · 0 to remove\"", O, BARTENDER + [click('input[aria-label="Assign Aisha Johnson"]')]),
    sc("saved", "Atama kaydedildi: \"Job saved · 1 employee assignments updated.\"", O, BARTENDER + [click('input[aria-label="Assign Aisha Johnson"]'), click("Save", within=DRAWER), {"wait": 600}]),
    sc("discard", "\"Discard changes?\" penceresi", O, BARTENDER + [click('input[aria-label="Assign Aisha Johnson"]'), click("Close job editor")]),
    sc("changed", "Başkası değiştirdi: \"Reload latest\"", O, BARTENDER + [click('input[aria-label="Assign Aisha Johnson"]'), click("Save", within=DRAWER), {"wait": 500}],
       fail=[err(r"/organization/jobs/[^/]+$", 409, "PATCH", "job.changed", "This job changed since you opened it. Reload it before saving.")]),
    sc("archived-job", "Arşivli job: \"Restore it to change assignments\"", O, path="/app/settings/jobs?tab=archived&jobId=00000321-0000-4000-8000-000000000321", setup="settings-archived"),
    sc("locked-row", "Değiştirilemeyen çalışan satırı (Sophie Martin, nedeniyle)", O, BARTENDER + [scroll('input[aria-label="Assign Sophie Martin"]')], setup="settings-locked-employee"),
    sc("paging", "56 çalışan: sayfa düğmesi yok, liste sonuna gelince devamı yüklenir", O, BARTENDER + [scroll('.job-employee-list > .job-employee-row:nth-child(50)'), {"wait": 600}, scroll('.job-employee-list > .job-employee-row:nth-child(56)')], setup="settings-many-employees"),
], part="Job çekmecesi · Employees")
extend("10.2", [
    sc("delete-job", "Job sil uyarısı (iki aşamalı)", O, BARTENDER + [click("Delete job", within=DRAWER)]),
    sc("delete-department", "Departman sil: \"Keep jobs in No department\" / \"Delete jobs too\"", O, [click("Actions for Kitchen"), click("Edit department"), click("Delete department", within=DRAWER)]),
    sc("owner-job", "Owner job'u silinemez: \"Management and Owner are kept\"", O,
       [click("Owner", within=".job-catalog"), click("Delete job", within=DRAWER), click("Delete job", within='[aria-label="Delete Owner?"]'), {"wait": 500}]),
    sc("archive-note", "Departman menüsü: \"Its 2 jobs will be archived too.\"", O, [click("Actions for Bar")]),
    sc("archive-department", "Bar arşivlendi: job'ları da Archived'de", O, [click("Actions for Bar"), click("Archive Bar"), click("Confirm archive Bar"), {"wait": 400}, tab("Archived")]),
    sc("restore-job", "Departmanı arşivli job geri gelir: No department altına", O,
       [click("Actions for Bar"), click("Archive Bar"), click("Confirm archive Bar"), {"wait": 400}, tab("Archived"),
        click("Restore Bartender"), {"wait": 400}, tab("Jobs"), scroll('[aria-label="No department"]')]),
    sc("archive-confirm", "Archive iki tık: Barback \"Confirm archive\"", O, armed([click("Actions for Barback"), click("Archive Barback")])),
], part="Silme ve arşiv · Delete / Archive")
JOBS_READ = SL + ["settings.jobs.read"]
extend("10.2", [
    sc("custom-readonly", "Özel rol yalnız Jobs okuma: New job, Add job ve satır menüleri yok; ana menüde Settings yok", C, perms=JOBS_READ),
    sc("custom-no-employees", "employees.read yok: sayılar \"—\"", C, perms=["workspace.read", "schedule.read", "settings.jobs.read"]),
    sc("custom-assign", "employees.manage var, Jobs düzenleme yok: ayrıntılar kilitli, atama açık", C, BARTENDER,
       perms=JOBS_READ + ["employees.manage"]),
], part="Roller")

# ---------- 10.3 Notifications ----------
set_part("10.3", "Politika kartları · Notification policies", ["owner"])
TOOL = ".notification-settings-toolbar > label:nth-of-type({}) select"
CARD1 = ".notification-policy-card:first-of-type"
REASON1 = fill(CARD1 + " .notification-reason input", "Fewer pings during the remodel")
CADENCE1 = fill(CARD1 + " .notification-policy-actions select", "daily_digest")
RESET_REASON = fill(".notification-reset-bar input", "Back to the defaults for the new season")
SHIFT_LEAD_ROLE = "role:00000c05-0000-4000-8000-000000000c05"
UPTOWN = "location:00000102-0000-4000-8000-000000000102"
extend("10.3", [
    sc("category", "Kategori süzgeci: Requests", O, [fill(TOOL.format(2), "requests")]),
    sc("no-match", "Arama sonuç yok: \"No notification types match these filters.\"", O, [fill(".notification-search input", "zzz")]),
    sc("scope-role", "Rol kapsamı: Shift Lead, Requests (shift değişimi \"Shift Lead · v1\")", O,
       [fill(TOOL.format(3), SHIFT_LEAD_ROLE), fill(TOOL.format(2), "requests"), scroll(".notification-policy-card:nth-of-type(3)")]),
    sc("scope-location", "Lokasyon kapsamı: Uptown (duyurular kapalı)", O, [fill(TOOL.format(3), UPTOWN)]),
    sc("mandatory", "Zorunlu tür: anahtar kilitli, \"Always shown in app\"", O, [fill(".notification-search input", "invitation")]),
    sc("channels", "Email ve Push \"(not available yet)\"", O, [scroll(CARD1 + " .notification-channel-fieldset")]),
    sc("draft", "Taslak: gerekçe kısa, Save kapalı", O, [CADENCE1, fill(CARD1 + " .notification-reason input", "ok")]),
    sc("saved", "Kaydedildi: \"Notification policy saved.\", kaynak \"Workspace · v1\"", O,
       [CADENCE1, REASON1, click(CARD1 + " .notification-policy-actions > button:last-of-type"), {"wait": 600}]),
    sc("save-error", "Kayıt hatası: iyimser düzenleme geri alındı", O,
       [CADENCE1, REASON1, click(CARD1 + " .notification-policy-actions > button:last-of-type"), {"wait": 500}],
       fail=[err(r"/notification-settings$", method="PATCH")]),
    sc("changed", "Başka yerde değişti: \"This policy changed elsewhere\"", O,
       [CADENCE1, REASON1, click(CARD1 + " .notification-policy-actions > button:last-of-type"), {"wait": 500}],
       fail=[err(r"/notification-settings$", 409, "PATCH", "notification.policy_changed", "notification policy stale version")]),
    sc("safe-test", "Safe test sonucu: \"Safe preview allowed; no external message was sent.\"", O, [click("Run safe test for New announcements"), {"wait": 400}]),
], part="Politika kartları · Notification policies")
extend("10.3", [
    sc("reset-all", "Reset all iki tık: \"Confirm reset all\"", O, armed([RESET_REASON, click("Reset all policies")])),
    sc("reset-all-done", "Hepsi sıfırlandı: \"3 notification policies reset.\"", O, [RESET_REASON, click("Reset all policies"), click("Confirm reset all"), {"wait": 600}]),
    sc("reset-category", "Kategori sıfırla: Requests \"Confirm reset category\"", O, armed([fill(TOOL.format(2), "requests"), RESET_REASON, click("Reset current category")])),
], part="Sıfırlama · Reset")
extend("10.3", [
    sc("audit", "Audit geçmişi açık (4 kayıt; ham eylem anahtarı görünür)", O, [click("Policy audit history"), scroll(".notification-audit")]),
    sc("audit-empty", "Audit boş: \"No policy changes recorded.\"", O, [click("Policy audit history"), scroll(".notification-audit")], setup="settings-no-audit"),
], part="Audit geçmişi · Policy audit history")
extend("10.3", [
    sc("loading", "Yükleniyor: gri satırlar (Loading notification settings)", O, hold=[r"/notification-settings$"]),
    sc("read-error", "Ayarlar okunamadı: We couldn't load notification settings + Try again", O, fail=[err(r"/notification-settings$")]),
    sc("denied", "API reddi: \"You don't have access to Notifications\"", O, fail=[err(r"/notification-settings$", 403)]),
], part="Sayfa durumları")
extend("10.3", [
    sc("custom-readonly", "Özel rol yalnız okuma: \"Read-only access\" şeridi, Reset ve Save yok", C, perms=SL + ["notifications.settings.read"]),
    sc("admin-no-test", "Admin, test izni yok: Safe test düğmesi yok", A, perms=admin_without("notifications.test_send")),
], part="Roller")

# ---------- 10.4 Schedule rules ----------
set_part("10.4", "Program kuralları · Schedule basics", ["owner"])
WINDOW = 'input[aria-label="Time off decision window (hours)"]'
AVAIL = '[aria-label="Availability settings"]'
extend("10.4", [
    sc("saved", "Sunday seçildi, kaydedildi: \"Scheduling rules saved.\"", O, [click("Sunday"), click("Save rules"), {"wait": 500}]),
    sc("window-max", "Karar penceresi 721: \"Enter a time off decision window from 0 to 720 hours.\"", O, [fill(WINDOW, "721"), click("Save rules")]),
    sc("window-empty", "Karar penceresi boş", O, [fill(WINDOW, ""), click("Save rules")]),
    sc("checklist", "Kurulum listesinden gelince: iki seçim boş, Save kapalı", O, path="/app/settings/scheduling?checklist=setup"),
    sc("save-error", "Kayıt hatası (sunucu)", O, [click("Sunday"), click("Save rules"), {"wait": 500}], fail=[err(r"/scheduling-settings$", method="PUT")]),
], part="Program kuralları · Schedule basics")
extend("10.4", [
    sc("mode", "Entry mode Shift type: \"Saved weeks will be converted\", Unsaved changes", O, [click("Shift type", within=AVAIL), scroll(".weekly-preferences-footer")]),
    sc("avail-saved", "Availability kaydedildi: \"Saved\"", O, [click('input[aria-label="Availability required during onboarding"]'), click("Save", within=AVAIL), scroll(".weekly-preferences-footer"), {"wait": 500}]),
    sc("missing-hours", "\"Default hours needed\": Close'un varsayılan saati yok", O, [click("Shift type", within=AVAIL), scroll(".weekly-preferences-footer")], setup="settings-shift-type-no-hours"),
    sc("avail-conflict", "Başka yerde değişti: \"Availability settings changed. Reload before saving.\"", O,
       [click('input[aria-label="Availability required during onboarding"]'), click("Save", within=AVAIL), scroll(".weekly-preferences-footer"), {"wait": 500}],
       fail=[err(r"/weekly/settings$", 409, "POST", error="Availability settings changed. Reload before saving.")]),
], part="Müsaitlik · Availability and staffing")
extend("10.4", [
    sc("loading", "Yükleniyor: gri satırlar (Loading schedule rules)", O, hold=[r"/scheduling-settings$"]),
    sc("read-error", "Kurallar okunamadı: We couldn't load schedule rules + Try again", O, fail=[err(r"/scheduling-settings$")]),
    sc("avail-read-error", "Availability ayarları okunamadı: We couldn't load availability settings + Try again (kurallar açık kalır)", O, fail=[err(r"/weekly/settings$")]),
    sc("denied", "API reddi: \"You don't have access to Schedule rules\"", O, fail=[err(r"/scheduling-settings$", 403)]),
], part="Sayfa durumları")
extend("10.4", [
    sc("custom-readonly", "Özel rol yalnız okuma: form kapalı, Availability bölümü yok", C, perms=SL + ["settings.schedule_rules.read"]),
], part="Roller")

# ---------- 10.5 Conflict handling ----------
page("10.5")["via"] = LANDINGS
set_part("10.5", "Çakışma kuralları · Conflict rules", ["owner"])
REST = 'select[aria-label="Minimum rest handling"]'
extend("10.5", [
    sc("saved", "Minimum rest Block, kaydedildi: \"Conflict rules saved.\"", O, [fill(REST, "block"), click("Save conflict rules"), {"wait": 500}, scroll(".organization-form-actions")]),
    sc("travel-range", "Travel 300 dakika: kayıt sessizce durur; uygulama mesajı yerine yalnız tarayıcının kendi uyarı balonu (ürün hatası)", O,
       [fill('input[aria-label="Minimum travel time (minutes)"]', "300"), click("Save conflict rules"), scroll(".organization-form-actions")]),
    sc("softer", "Grace'ten yumuşak overdue: doğrulama hatası", O,
       [fill('select[aria-label="Conditional documents during grace handling"]', "block"),
        fill('select[aria-label="Conditional documents after grace handling"]', "confirm"), click("Save conflict rules"), scroll(".organization-form-actions")]),
    sc("undone", "Değişiklik geri alındı: Save kapalı", O, [fill(REST, "block"), fill(REST, "warn"), scroll(".organization-form-actions")]),
    sc("changed", "Başka yerde değişti (409)", O, [fill(REST, "block"), click("Save conflict rules"), {"wait": 500}, scroll(".organization-form-actions")],
       fail=[err(r"/scheduling-settings/conflicts$", 409, "PUT", error="Conflict rules changed. Reload the current rules before saving.")]),
    sc("reload", "Reload rules: taslak atıldı", O, [fill(REST, "block"), click("Reload rules"), {"wait": 400}, scroll(".organization-form-actions")]),
], part="Çakışma kuralları · Conflict rules")
extend("10.5", [
    sc("loading", "Yükleniyor: gri satırlar (Loading conflict rules)", O, hold=[r"/scheduling-settings/conflicts$"]),
    sc("read-error", "Kurallar okunamadı: We couldn't load conflict rules + Try again", O, fail=[err(r"/scheduling-settings/conflicts$")]),
    sc("denied", "API reddi: \"You don't have access to Conflict handling\"", O, fail=[err(r"/scheduling-settings/conflicts$", 403)]),
], part="Sayfa durumları")
extend("10.5", [
    sc("admin-no-rules", "Admin, çakışma izni yok: sayfa çizilmez, aynı adreste erişim kartı (You don't have access to Conflict handling)", A, perms=admin_without("schedule.conflict_rules.manage")),
], part="Roller")

# ---------- 10.6 Shift catalog (states only) ----------
extend("10.6", [
    sc("loading", "Yükleniyor: tablonun gri satırları (Loading shift types)", O, hold=[r"/settings/shift-types$"]),
    sc("read-error", "Liste okunamadı: We couldn't load shift types + Try again", O, fail=[err(r"/settings/shift-types$")]),
], part="Sayfa durumları")

# ---------- 10.7 Shift labels ----------
page("10.7")["via"] = r"^/app/settings/scheduling/shift-label/?$"
replace("10.7", "new", sc("new", "Yeni etiket", O, [click("New shift label")]))
set_part("10.7", "Liste · Shift labels", ["owner"])
set_part("10.7", "Etiket çekmecesi · New / Edit shift label", ["edit", "new"])
LABEL_NAME = "#shift-catalog-name"
extend("10.7", [
    sc("no-match", "Arama sonuç yok", O, [fill('input[aria-label="Search shift labels"]', "zzz")]),
    sc("sorted", "Ada göre sıralı (aynı başlığa üçüncü tık ilk sıraya döner)", O, [click("Sort by Shift label")]),
    sc("move", "Move up: Closer, Opener'ın üstüne çıktı", O, [click("Actions for Closer"), click("Move Closer up"), {"wait": 500}]),
    sc("archive", "Archive iki tık: Training \"Confirm archive\"", O, armed([click("Actions for Training"), click("Archive")])),
    sc("archived-patio", "Arşivli Patio listenin sonunda; menüsü tablo içinde kesiliyor (ürün hatası)", O, [click("Actions for Patio")], setup="settings-archived"),
    sc("empty", "Hiç etiket yok", O, setup="settings-no-labels"),
    sc("old-address", "Eski adres /shift-label: Shift labels'a gider", O, path="/app/settings/scheduling/shift-label"),
    sc("loading", "Yükleniyor: tablonun gri satırları (Loading shift labels)", O, hold=[r"/settings/shift-labels$"]),
    sc("read-error", "Etiketler okunamadı: We couldn't load shift labels + Try again", O, fail=[err(r"/settings/shift-labels$")]),
    sc("denied", "API reddi: \"You don't have access to Shift labels\"", O, fail=[err(r"/settings/shift-labels$", 403)]),
], part="Liste · Shift labels")
extend("10.7", [
    sc("dup", "Aynı ad: \"A label with this name already exists\"", O, [click("New shift label"), fill(LABEL_NAME, "Opener"), click("Save shift label"), {"wait": 400}]),
    sc("saved", "Kaydedildi: Lead Server listede", O, [click("New shift label"), fill(LABEL_NAME, "Lead Server"), click("Save shift label"), {"wait": 500}]),
    sc("delete", "Sil paneli: \"Delete “Training”?\", Keep / Delete", O, [click("Edit Training"), click("Delete shift label", within=".catalog-drawer")]),
], part="Etiket çekmecesi · New / Edit shift label")
extend("10.7", [
    sc("custom-readonly", "Özel rol yalnız okuma: New yok, satırlar açılmaz", C, perms=SL + ["settings.shift_catalog.read"]),
], part="Roller")

# ---------- 10.8 Roles & permissions ----------
page("10.8")["via"] = LANDINGS + r"|^/app/settings/roles/[^/]+/?$"  # New role opens /roles/new, a saved role its own address
set_part("10.8", "Rol listesi · Workspace roles", ["owner"])
set_part("10.8", "Yeni rol · New role", ["new"])
NEW = [click("New role")]
extend("10.8", [
    sc("copy-start", "Başlangıç \"Copy Shift Lead\"", O, NEW + [fill(".rp-panel select", "00000c05-0000-4000-8000-000000000c05")]),
    sc("employee-exp", "Employee experience: yalnız Personal access", O, NEW + [fill(".rp-fields .rp-field:nth-of-type(2) select", "employee")]),
    sc("name-empty", "Ad boş: Save sessizce durur (yalnız tarayıcının kendi uyarı balonu, uygulama mesajı yok)", O, NEW + [click('input[aria-label="Schedule category Read"]'), click("Save changes"), {"wait": 400}]),
    sc("created", "Yeni rol kaydedildi: Host Lead açıldı, sekmeler \"Custom roles +4\" altında toplandı", O, NEW + [fill(".rp-fields .rp-field:first-of-type input", "Host Lead"),
       click('input[aria-label="Schedule category Read"]'), click("Save changes"), {"wait": 700}]),
], part="Yeni rol · New role")
extend("10.8", [
    sc("discard", "Kaydedilmemiş değişiklikle rol değiştirme: \"Discard role changes?\"", O,
       [click('input[aria-label="Communication category Edit"]'), click("Employee Built-in")]),
    sc("many", "4'ten çok özel rol: \"Custom roles +5\" listesi", O, [click("Custom roles")], setup="settings-many-roles"),
    sc("loading", "Yükleniyor: tablonun gri satırları (Loading roles)", O, hold=[r"/settings/roles$"]),
    sc("read-error", "Roller okunamadı: We couldn't load roles + Try again", O, fail=[err(r"/settings/roles$")]),
    sc("denied", "API reddi: \"You don't have access to Roles & permissions\"", O, fail=[err(r"/settings/roles$", 403)]),
], part="Rol listesi · Workspace roles")
extend("10.8", [
    sc("admin", "Admin · Daniel Brooks: New role var", A),
    sc("admin-readonly", "Admin, roles.manage yok: New role yok, kilit metni", A, perms=admin_without("roles.manage")),
    sc("custom-denied", "Özel rol Roles adresini yazar: aynı adreste erişim kartı (You don't have access to Roles & permissions)", C, perms=SL + READ_SETTINGS),
    sc("manager-denied", "Manager Roles adresini yazar: aynı adreste erişim kartı (You don't have access to Settings)", M, [{"wait": 1500}]),
], part="Roller")

# ---------- 10.9 Role detail ----------
page("10.9")["via"] = r"^/app/settings/roles/?$"
set_part("10.9", "Rol düzenleyici · Role editor", ["custom", "builtin"])
R = lambda n: f"/app/settings/roles/00000c0{n}-0000-4000-8000-000000000c0{n}"
extend("10.9", [
    sc("admin-role", "Admin rolü: bütün gruplar, Locations ve Roles satırları dahil", O, [click("Organization settings", within=".rp-panel")], path=R(2)),
    sc("employee-role", "Employee rolü: yalnız Personal access", O, path=R(4)),
    sc("owner-role", "Owner rolü adresle: kilitli, \"Owner is protected…\"", O, path=R(1)),
    sc("group-open", "Schedule grubu açık: alan satırları ve bilgi ikonları", O, [click(".rp-category-toggle")]),
    sc("mixed", "Requests: \"Custom\" özet, yarı işaretli kutu", O, [click(".rp-category + .rp-category .rp-category-toggle")]),
    sc("dependency", "Bağımlılık: Availability Edit, Read'i de işaretler", O,
       [click(".rp-category-toggle"), click('input[aria-label="Availability Edit"]')], path=R(6)),
    sc("not-grantable", "Manager sınıfı: Organization settings'te Locations ve Roles satırı yok", O, [click("Organization settings", within=".rp-panel")]),
    sc("saved", "Kaydedildi: \"Role saved.\"", O, [click('input[aria-label="Employees category Edit"]'), click("Save changes"), {"wait": 600}], path=R(6)),
    sc("cancel", "Cancel: taslak geri alındı", O, [click('input[aria-label="Employees category Edit"]'), click("Cancel", within=".rp-panel")], path=R(6)),
    sc("copy", "Copy role: yeni rol formu \"Shift Lead copy\"", O, [click("Copy role")]),
    sc("delete", "Delete role iki tık: \"Confirm delete\" (Kitchen Lead, 0 üye)", O, armed([click("Delete role")]), path=R(6)),
    sc("deleted", "Silindi: Kitchen Lead listeden çıktı", O, [click("Delete role"), click("Confirm delete"), {"wait": 700}], path=R(6)),
    sc("delete-blocked", "Silinemez: \"Role has dependencies\" (2 üye)", O, armed([click("Delete role")])),
    sc("changed", "Başkası kaydetti (409): ham sunucu metni çıkar, \"This role changed\" dalı çalışmıyor (ürün hatası)", O,
       [click('input[aria-label="Employees category Edit"]'), click("Save changes"), {"wait": 500}],
       fail=[err(r"/roles/[^/]+$", 409, "PUT", "role.changed", "Role changed since you opened it. Reload before saving.")]),
    sc("refused", "Sunucu reddi: \"Permission is not eligible for a lower role\"", O,
       [click('input[aria-label="Employees category Edit"]'), click("Save changes"), {"wait": 500}],
       fail=[err(r"/roles/[^/]+$", 403, "PUT", "authz.rank", "Permission is not eligible for a lower role")]),
    sc("not-found", "Rol bulunamadı: \"Role not found\"", O, path="/app/settings/roles/00000c99-0000-4000-8000-000000000c99"),
], part="Rol düzenleyici · Role editor")
extend("10.9", [
    sc("admin-own", "Admin kendi rolünü açar: değiştiremez, kilit metni", A, path=R(2)),
    sc("admin-readonly", "Admin, roles.manage yok: kutular kapalı, alt çubuk yok", A, perms=admin_without("roles.manage")),
], part="Roller")

# ---------- 10.10 Documents ----------
page("10.10")["via"] = r"^/app/employees/documents/?$"
set_part("10.10", "Liste · All / Draft / Published / Archived", ["owner", "drafts"])
set_part("10.10", "Belge türü çekmecesi · New / Edit document type", ["new"])
DOC_TITLE = 'input[data-document-field="title"]'
NEW_DOC = [{"wait": 900}, click("New document")]  # the button waits for the list to load
DOC_NEW = NEW_DOC + [fill(DOC_TITLE, "Alcohol Server Certificate")]
replace("10.10", "new", sc("new", "Yeni belge türü, adım 1: Name boş, Next kapalı", O, NEW_DOC, part="Belge türü çekmecesi · New / Edit document type"))
DOC_REASON = fill(".catalog-drawer textarea", "Ready for every new hire")
extend("10.10", [
    sc("published", "Published sekmesi", O, [click("Published", within='[aria-label="Document status"]')]),
    sc("archived", "Archived sekmesi: TB Test Results", O, [click("Archived", within='[aria-label="Document status"]')]),
    sc("conditional", "Requirement süzgeci: Conditional (Food Handler Card)", O, [fill('select[aria-label="Filter by requirement"]', "conditional")]),
    sc("no-match", "Arama sonuç yok: \"No document types match these filters.\"", O, [fill('input[aria-label="Search document types"]', "zzz")]),
    sc("move", "Move down: Form I-9, Food Handler Card'ın altına indi", O, [click("Actions for Form I-9"), click("Move down"), {"wait": 500}]),
    sc("archive", "Archive iki tık: Form W-4 \"Confirm archive\"", O, armed([click("Actions for Form W-4"), click("Archive")])),
    sc("restore", "Restore: TB Test Results arşivden çıktı, Archived sekmesi boşaldı", O,
       [click("Archived", within='[aria-label="Document status"]'), click("Actions for TB Test Results"), click("Restore"), {"wait": 500}]),
    sc("empty", "Hiç belge türü yok: \"No document types\" + New document", O, setup="settings-no-documents"),
], part="Liste · All / Draft / Published / Archived")
extend("10.10", [
    sc("step2", "Adım 2: Fields & review özeti", O, DOC_NEW + [click("Next")]),
    sc("conditional-new", "Conditional seçildi: \"Who needs it\" süzgeçleri açık", O,
       DOC_NEW + [fill('select[data-document-field="mode"]', "conditional"), scroll(".document-options")]),
    sc("field-empty", "Boş ek alan: Save kapalı", O, DOC_NEW + [click("Next"), click("Add field")]),
    sc("view", "Yayımlı belge: \"Published - unpublish to edit\", alanlar kilitli", O, [click("Actions for Form W-4"), click("View document type")]),
    sc("edit-saved", "Taslak düzenlendi ve kaydedildi: drawer kapandı", O,
       [click("Actions for Direct Deposit Form"), click("Edit document type"),
        fill('textarea[data-document-field="description"]', "Bank details for paychecks. Attach a voided check."), click("Next"), click("Save"), {"wait": 600}]),
    sc("dup", "Aynı ad: \"A document with this title already exists.\"", O,
       NEW_DOC + [fill(DOC_TITLE, "Form W-4"), click("Next"), click("Save"), {"wait": 500}]),
], part="Belge türü çekmecesi · New / Edit document type")
extend("10.10", [
    sc("publish", "Yayın penceresi: kime gider, eşleşen çalışanlar (Reason aşağıda)", O, [click("Actions for Direct Deposit Form"), click("Publish"), {"wait": 500}]),
    sc("published-now", "Yayımlandı: Direct Deposit Form \"Published\"", O,
       [click("Actions for Direct Deposit Form"), click("Publish"), {"wait": 500}, DOC_REASON, click("Confirm publish"), {"wait": 600}]),
    sc("unpublish", "Unpublish penceresi: Form W-4 duraklatılır", O, [click("Actions for Form W-4"), click("Unpublish"), {"wait": 500}]),
    sc("impact-changed", "Etki değişti (409): \"Refresh impact\"", O,
       [click("Actions for Direct Deposit Form"), click("Publish"), {"wait": 500}, DOC_REASON, click("Confirm publish"), {"wait": 500}, scroll(".catalog-drawer [role=alert]")],
       fail=[err(r"/document-types/[^/]+/publish$", 409, "POST", error="Document publication impact changed; refresh preview")]),
], part="Yayın penceresi · Publish / Unpublish")
extend("10.10", [
    sc("loading", "Yükleniyor: tablonun gri satırları (Loading document types)", O, hold=[r"/settings/document-types$"]),
    sc("read-error", "Belge türleri okunamadı: We couldn't load document types + Try again", O, fail=[err(r"/settings/document-types$")]),
    sc("denied", "API reddi: \"You don't have access to Documents\"", O, fail=[err(r"/settings/document-types$", 403)]),
    sc("old-link", "Eski bağlantı ?view=employees: Employees › Documents'a gider", O, path="/app/settings/documents?view=employees"),
], part="Sayfa durumları")
extend("10.10", [
    sc("admin", "Admin · Daniel Brooks: New document ve satır menüleri var", A),
    sc("custom-readonly", "Özel rol yalnız okuma: New ve menü yok, satır açılmaz (ayrıntı okunamaz — ürün hatası)", C, perms=SL + ["documents.read"]),
    sc("employee-docs", "Yalnız çalışan belgesi okuyan özel rol: Employees › Documents'a gider", C, perms=SL + ["employee_documents.read"]),
], part="Roller")

# ---------- 10.11 Acknowledgements ----------
page("10.11")["via"] = LANDINGS
set_part("10.11", "Şablonlar · Templates", ["owner", "preview"])
set_part("10.11", "Saklama süreleri · Retention", ["retention"])
HANDBOOK = [click("Actions for Employee Handbook"), click("Edit template")]
TIPS = [click("Actions for Tip Pooling Policy"), click("Edit template")]
ACK_TITLE = ".acknowledgement-fields > label:nth-of-type(1) input"
ACK_POLICY = ".acknowledgement-fields > label:nth-of-type(4) select"
RETENTION = [click("Retention", within='[aria-label="Acknowledgement settings"]')]
extend("10.11", [
    sc("publish-step", "Menüde onay adımı: \"Confirm publish\"", O, [click("Actions for Employee Handbook"), click("Publish template")]),
    sc("published", "Yayımlandı: Handbook v2 \"Published\"", O, [click("Actions for Employee Handbook"), click("Publish template"), click("Confirm publish"), {"wait": 600}]),
    sc("publish-refused", "Yayın reddi: taslak Massachusetts politikasına bağlı", O,
       [click("Actions for Employee Handbook"), click("Publish template"), click("Confirm publish"), {"wait": 500}], setup="settings-draft-policy"),
    sc("show-archived", "Show archived: arşivlenen Tip Pooling Policy listede", O,
       [click("Actions for Tip Pooling Policy"), click("Archive"), click("Confirm archive"), {"wait": 500}, click(".job-archive-filter input")]),
    sc("no-match", "Arama sonuç yok", O, [fill('input[aria-label="Search acknowledgements"]', "zzz")]),
    sc("no-templates", "Hiç şablon yok: \"No acknowledgement templates yet\"", O, setup="settings-no-templates"),
    sc("no-policy", "Onaylı politika yok: uyarı, Add template kapalı, satırlarda \"Missing retention policy\"", O, setup="settings-no-retention"),
], part="Şablonlar · Templates")
extend("10.11", [
    sc("new", "Yeni şablon çekmecesi", O, [{"wait": 900}, click("Add template")]),
    sc("title-empty", "Title boş: Save draft template kapalı", O, [{"wait": 900}, click("Add template"), fill(ACK_TITLE, "")]),
    sc("apply", "Taslak düzenleme + \"Apply to existing assignments\" etki önizlemesi", O,
       HANDBOOK + [click("Preview impact"), {"wait": 500}, scroll('[aria-label="Apply document definition"]')]),
    sc("unpublish", "Unpublish iki adım: Tip Pooling \"Confirm unpublish\"", O, TIPS + [click("Unpublish", within=".catalog-drawer")]),
    sc("delete", "Delete acknowledgement paneli", O, TIPS + [click("Delete acknowledgement", within=".catalog-drawer")]),
], part="Şablon çekmecesi · Acknowledgement template")
extend("10.11", [
    sc("new-policy", "Yeni saklama politikası çekmecesi", O, RETENTION + [click("Add policy")]),
    sc("approve-step", "Politika onay adımı: \"Confirm approval\"", O, RETENTION + [click("Actions for Massachusetts personnel records"), click("Approve policy")]),
    sc("approved", "Onaylandı: Massachusetts \"Approved\"", O,
       RETENTION + [click("Actions for Massachusetts personnel records"), click("Approve policy"), click("Confirm approval"), {"wait": 600}]),
    sc("approved-drawer", "Onaylı politika: alanlar kilitli, Unapprove", O, RETENTION + [click("Personnel records (federal)")]),
    sc("delete-policy", "Delete policy paneli", O, RETENTION + [click("Actions for Massachusetts personnel records"), click("Edit policy"), click("Delete policy", within=".catalog-drawer")]),
    sc("no-retention", "Hiç politika yok", O, RETENTION, setup="settings-no-retention"),
], part="Saklama süreleri · Retention")
extend("10.11", [
    sc("loading", "Yükleniyor: gri satırlar (Loading acknowledgement settings)", O, hold=[r"/settings/acknowledgements$"]),
    sc("read-error", "Ayarlar okunamadı: We couldn't load acknowledgement settings + Try again", O, fail=[err(r"/settings/acknowledgements$")]),
    sc("denied", "API reddi: \"You don't have access to Acknowledgements\"", O, fail=[err(r"/settings/acknowledgements$", 403)]),
], part="Sayfa durumları")
extend("10.11", [
    sc("custom-readonly", "Özel rol yalnız okuma: Add yok, menüde yalnız Preview template", C, [click("Actions for Employee Handbook")], perms=SL + ["documents.read"]),
    sc("custom-retention", "Özel rol yalnız okuma: saklama satırında menü yok", C, RETENTION, perms=SL + ["documents.read"]),
    sc("manager-denied", "Manager adresi yazar: aynı adreste erişim kartı (You don't have access to Settings)", M, [{"wait": 1500}]),
], part="Roller")

# ---------- 10.12 Support ----------
page("10.12")["via"] = LANDINGS
set_part("10.12", "Destek · Support", ["owner"])
extend("10.12", [
    sc("copied", "Copy diagnostics: \"Copied\"", O, [click("Copy diagnostics"), {"wait": 300}], setup="settings-clipboard-ok"),
    sc("copy-failed", "Pano izni yok: \"Copy failed. Select the values manually.\"", O, [click("Copy diagnostics"), {"wait": 300}], setup="settings-clipboard-blocked"),
], part="Destek · Support")
extend("10.12", [
    sc("admin", "Admin: Effective role \"Admin\"", A),
    sc("custom", "Özel rol: Effective role \"Shift Lead\"", C, perms=SL + READ_SETTINGS),
    sc("manager-denied", "Manager adresi yazar: aynı adreste erişim kartı (You don't have access to Settings)", M, [{"wait": 1500}]),
], part="Roller")
