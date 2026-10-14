# Schedule (3.0), Schedule export (3.1), Schedule templates (3.2), Requests (3.3).
# Envanter: scratchpad/envanter/schedule.md. Run by tools/screens.py.
# Gestures a click cannot make (keys, Ctrl+click, double/right click, hover,
# drag) are "act" steps (schedule-steps.ts).

def _t(t):
    return t if t.startswith(("text=", "input", "button", "[", ".", "#", "main", "section", "div", "td", "th", "aside", "label", "span", "summary", "details", "li", "a[", "select", "textarea", "header", "form", "table", "tr")) else "text=" + t
def act(kind, target=None, **kw):
    d = {"act": kind}
    if target: d["target"] = _t(target)
    if "to" in kw and kw["to"] and kind == "drag": kw["to"] = _t(kw["to"])
    d.update({k: v for k, v in kw.items() if v is not None})
    return d
def key(k, target=None, **kw): return act("key", target, key=k, **kw)
def wait(ms): return {"wait": ms}
def P(*ids): return list(ids)

# Read-only custom role (only schedule.read) and friends.
BASE = ["workspace.read", "notifications.read", "notifications.read_own", "announcements.read", "notifications.preferences.write_own"]
RO = BASE + ["schedule.read", "employees.read"]

# Common openings.
NEXT = [click("Next week"), wait(900)]
NEXT2 = NEXT + [click("Next week"), wait(900)]
PREV = [click("Previous week"), wait(900)]
DRAFTS = [click("Draft selector:")]
BLANK = DRAFTS + [click("Blank schedule"), wait(900)]
# The New Schedule window and its tabs.
WIN = '[role="dialog"]'
TAB_TEMPLATES = DRAFTS + [click("Templates", within=WIN), wait(700)]
TAB_EXPORT = DRAFTS + [click("Export", within=WIN), wait(1800)]
TPL_FORM = '[aria-label="Save a draft as a template"]'
SAVE_TEMPLATE_FORM = [click("button.new-schedule-window-main"), wait(400)]
def more(name): return [click(f'[aria-label="More for {name}"]'), wait(300)]
LIVE = DRAFTS + [click("Edit live schedule"), wait(1200)]
NEXT_DRAFT_VIEW = NEXT + DRAFTS + [click('[aria-label="View Next week plan"]'), wait(900)]
ARMED = '[data-confirming="true"]'
NEXT_DRAFT_EDIT = NEXT + DRAFTS + [click("Edit Next week plan"), wait(1200)]
CARD = '[data-shift-badge]:not([data-ghost="true"])'
PERIOD = "button.schedule-view-mode:not(.schedule-date-calendar-trigger)"

# ---------------------------------------------------------------- 3.0 Schedule
set_part("3.0", "Roller", ["owner", "manager"])
set_part("3.0", "Üst çubuk · tarih ve görünüm", ["next", "calendar"])
set_part("3.0", "Üst çubuk · Settings", ["settings"])
set_part("3.0", "Üst çubuk · filtreler", ["filter"])
set_part("3.0", "New Schedule penceresi · Schedules", ["drafts", "past-draft"])
set_part("3.0", "Düzenleme · giriş ve çubuk", ["add", "time-off"])
replace("3.0", "manager", sc("manager", "Manager · Rachel Adams: yalnız Downtown; Uptown'daki vardiyaları hayalet kart", M, part="Roller"))

extend("3.0", [
    sc("admin", "Admin · Daniel Brooks: bütün lokasyonlar", A),
    sc("shift-lead", "Shift Lead (özel rol, yayınlayamaz): Publish yok, düzenlemede Save draft", C),
    sc("read-only", "Salt okur özel rol (yalnız schedule.read): Export, Templates, New Schedule, Publish yok", C, perms=RO),
    sc("employee", "Employee Schedule'a giremez: aynı adreste erişim kartı (You don't have access to Schedule)", E),
    sc("manager-ghost", "Müdür: Jake Thompson'ın Uptown vardiyası hayalet kart (Sun)", M, [act("hover", '[data-ghost="true"]')]),
], part="Roller")

extend("3.0", [
    sc("phone", "Telefonda kapalı: \"Schedule is available on a computer.\" (sağdaki telefon çerçevesi)", O),
    sc("loading", "Yükleniyor: haftanın gri iskeleti (B görünümü)", O, hold=[r"/schedule/reference"]),
    sc("error", "Hafta okunamadı: We couldn't load Schedule + Try again (oklar çalışır)", O, fail=[{"path": r"/schedule/reference", "method": "GET", "status": 500}]),
    sc("no-access", "Erişim yok kartı", M, fail=[{"path": r"/schedule/reference", "method": "GET", "status": 403}]),
], part="Sayfa durumları")

extend("3.0", [
    sc("prev", "Önceki hafta: geçmiş hafta, salt okunur önizleme", O, PREV),
    sc("return-cue", "Bu hafta değil: dönem düğmesinde dönüş işareti (Jump to this week)", O, NEXT + [act("hover", PERIOD)]),
    sc("day", "Gün görünümü (bugün): dönem düğmesi → Switch to daily view", O, [click(PERIOD), wait(900)]),
    sc("day-header", "Gün başlığına tık: o günün gün görünümü (Wed)", O, [click('[aria-label^="View Wed"]'), wait(900)]),
    sc("day-next", "Gün görünümünde Next day", O, [click(PERIOD), wait(900), click("Next day"), wait(900)]),
    sc("calendar-marks", "Takvim: önemli gün ve kapalı gün işaretleri (Aralık: Christmas)", O, [click("Open schedule calendar"), click("Next month"), click("Next month"), wait(300)]),
    sc("calendar-month", "Takvim: ay seçici (Pick month)", O, [click("Open schedule calendar"), click("Pick month")]),
    sc("calendar-year", "Takvim: yıl seçici (Pick year)", O, [click("Open schedule calendar"), click("Pick year")]),
    sc("calendar-week", "Takvim: \"Jump to week of …\" ile iki hafta sonrasına atlama", O, [click("Open schedule calendar"), click('[aria-label^="Jump to week of"]', within='[aria-label="Schedule calendar"]'), wait(900)]),
], part="Üst çubuk · tarih ve görünüm")
replace("3.0", "calendar-week", sc("calendar-week", "Takvim: hafta satırına tıklayıp o haftaya atlama (\"Jump to week of …\")", O,
        [click("Open schedule calendar"), click('[aria-label^="Jump to week of"]', within='[aria-label="Schedule calendar"]'), wait(900)], part="Üst çubuk · tarih ve görünüm"))

# Ids of the demo world (mock/world.ts).
def eid(n): return f"{n:08x}-0000-4000-8000-{n:012x}"
EMP = {"maria": 0x601, "jake": 0x602, "priya": 0x603, "ethan": 0x604, "sophie": 0x605, "daniel": 0x606, "carlos": 0x607,
       "aisha": 0x608, "tom": 0x609, "luis": 0x60a, "emma": 0x60b, "noah": 0x60c, "olivia": 0x60d, "marcus": 0x60e, "grace": 0x60f, "sam": 0x610}
DT, UT = eid(0x101), eid(0x102)
def cell(emp, day, loc=None):
    loc = loc or (UT if emp in ("emma", "noah", "olivia", "marcus", "grace", "sam") else DT)
    return f'[data-drop-cell="true"][data-employee-id="{eid(EMP[emp]) if emp else ""}"][data-location-id="{loc}"][data-date="{{week+{day}}}"]'
def card(emp, day, loc=None): return cell(emp, day, loc) + ' [data-shift-badge]:not([data-ghost="true"])'
def CL(t, **kw): return act("click", t, **kw)
def addbtn(emp, day, loc=None):
    loc = loc or (UT if emp in ("emma", "noah", "olivia", "marcus", "grace", "sam") else DT)
    name = {"maria": "Maria Lopez", "jake": "Jake Thompson", "priya": "Priya Patel", "ethan": "Ethan Brooks", "sophie": "Sophie Martin",
            "daniel": "Daniel Kim", "carlos": "Carlos Rivera", "aisha": "Aisha Johnson", "tom": "Tom Becker", "luis": "Luis Hernandez",
            "emma": "Emma Wilson", "noah": "Noah Garcia", "olivia": "Olivia Chen", "marcus": "Marcus Reed", "grace": "Grace Murphy", "sam": "Sam Okafor"}.get(emp, "unassigned")
    place = "Harbor & Vine Uptown" if loc == UT else "Harbor & Vine Downtown"
    return f'[aria-label="Add shift for {name} at {place} on {{week+{day}}}"]'
SETTINGS = [click("Settings", within="main")]

replace("3.0", "settings", sc("settings", "Görünüm ayarları paneli (önizlemede Unassigned, Freeze ve Availability pasif)", O, SETTINGS, part="Üst çubuk · Settings"))
extend("3.0", [
    sc("sort-job", "Job/Position sıralaması: rol ayırıcı ve preset satırları", O, SETTINGS + [click("Job/Position"), wait(400)]),
    sc("badges-off", "Kart ayarları kapalı: tür, etiket ve saat gizli rozetler", O, SETTINGS + [click("Hide Shift type in badges"), click("Hide Labels in badges"), click("Hide Clock in/out in badges")]),
    sc("total-hours", "Total hours açık: satır toplamları ve toplam satırı", O, SETTINGS + [click("Show Total hours"), act("key", None, key="Escape")]),
    sc("edit-settings", "Düzenlemede ayarlar: Unassigned, Freeze ve Availability etkin", O, LIVE + SETTINGS),
    sc("unassigned-hidden", "Düzenlemede Unassigned satırı gizli", O, LIVE + SETTINGS + [click("Hide Unassigned Shifts Row"), key("Escape")]),
    sc("unassigned-unfrozen", "Düzenlemede Unassigned satırı dondurulmamış (Unfreeze)", O, LIVE + SETTINGS + [click("Unfreeze Unassigned Shifts Row"), key("Escape")]),
    sc("default-times", "Use default times for scheduling: preset çipi saatli vardiya ekler", O, LIVE + SETTINGS + [click("Job/Position"), click("Use default times for scheduling"), key("Escape"), wait(300), CL('[data-schedule-preset-chip="true"]:not([disabled])'), wait(900)]),
], part="Üst çubuk · Settings")

extend("3.0", [
    sc("loc-menu", "Lokasyon filtresi menüsü açık (All locations, Merge locations)", O, [click("All locations")]),
    sc("loc-uptown", "Tek lokasyona süzülmüş ızgara (Uptown)", O, [click("All locations"), click("Harbor & Vine Uptown", within='[data-topbar-filter-content="locations"]'), key("Escape"), wait(600)]),
    sc("loc-header", "Lokasyon başlığına tık: o lokasyona süzer (Downtown)", O, [click('.schedule-location-header'), wait(600)]),
    sc("merged", "Merge locations: birleşik görünüm (kartta lokasyon adı)", O, [click("All locations"), click("Merge locations"), key("Escape"), wait(600)]),
    sc("jobs-menu", "İş filtresi: departman grupları", O, [click("All jobs")]),
    sc("jobs-kitchen", "İş filtresi: yalnız Kitchen", O, [click("All jobs"), click('[data-topbar-filter-content="jobs"] [aria-label="Kitchen"]'), key("Escape"), wait(600)]),
    sc("types-menu", "Vardiya türü filtresi", O, [click("All shifts")]),
    sc("employees-menu", "Çalışan filtresi", O, [click("All employees")]),
    sc("hide-unscheduled", "Hide Unscheduled: vardiyasız kişiler gizli", O, [click("Hide Unscheduled"), wait(500)]),
    sc("chip-remove", "Filtre çipini kaldırma: tür süzgeci gider, iş süzgeci kalır", O, [click(CARD), wait(500), click('[aria-label^="Remove"]'), wait(500)]),
    sc("escape-clear", "Escape ile katman katman temizleme: kart tıkıyla gelen Lunch / Line Cook süzgeci iki Escape'te gitti", O, [click(CARD), wait(500), key("Escape"), wait(300), key("Escape"), wait(500)]),
    sc("no-locations", "\"No locations match\": ızgarada lokasyon kalmıyor (lokasyonsuz workspace)", O, setup="schedule-no-locations"),
], part="Üst çubuk · filtreler")

extend("3.0", [
    sc("published-menu", "Yayında hafta: Published menüsü (Publish another draft, Unpublish schedule)", O, [click("Published")]),
    sc("publish-hint", "Yayın ve açık taslak yok: pasif Publish ve ipucu", O, NEXT2 + [act("hover", '[data-schedule-top-action-trigger="publish"]')]),
    sc("publish-draft", "Yayınsız haftada taslak önizlemedeyken yeşil Publish düğmesi (Holiday prep)", O, NEXT2 + DRAFTS + [click('[aria-label="View Holiday prep"]'), wait(900), act("hover", '[data-schedule-top-action-trigger="publish"]')], setup="schedule-draft-two-weeks"),
    sc("publish-no-draft", "Yayınsız hafta, kayıtlı taslak var: \"Open a saved draft…\" ipucu", O, NEXT2 + [act("hover", '[data-schedule-top-action-trigger="publish"]')], setup="schedule-draft-two-weeks"),
], part="Üst çubuk · eylem düğmeleri")

extend("3.0", [
    sc("drafts-next", "Kayıtlı taslaklı hafta: Next week plan satırı (kaydeden, vardiya ve saat, Edit, Delete)", O, NEXT + DRAFTS),
    sc("draft-view", "Taslak önizleme: \"On screen\" çipi, düğmenin adı taslağın adı", O, NEXT_DRAFT_VIEW + DRAFTS),
    sc("draft-published-row", "Yayındaki taslak ilk satırda: \"Live\", Unpublish simgesi, Delete yok", O, NEXT + DRAFTS, setup="schedule-next-plan-live"),
    sc("draft-delete", "Taslağı silme: iki tık (Delete?)", O, NEXT + DRAFTS + [click("Delete Next week plan")]),
    sc("draft-deleted", "Taslak silindi: \"Draft deleted\"", O, NEXT + DRAFTS + [click("Delete Next week plan"), click(ARMED), wait(600)]),
    sc("template-from-window", "Taslak ekrandayken Templates → Save template: ekrandaki taslak seçili gelir", O, NEXT_DRAFT_VIEW + TAB_TEMPLATES + SAVE_TEMPLATE_FORM),
    sc("drafts-error", "Taslak listesi okunamadı: The drafts didn't load, so editing didn't start. Nothing was changed. + Try again", O, BLANK, fail=[{"path": r"/schedule/drafts$", "method": "GET", "status": 500}]),
    sc("draft-shifts-error", "Taslak okunamadı: We couldn't load this draft + Try again (boş taslak gösterilmez)", O, NEXT_DRAFT_VIEW, fail=[{"path": r"/schedule/shifts$", "method": "GET", "status": 500}]),
    sc("draft-unavailable", "Taslak artık erişilemez: \"This draft is no longer available to you.\"", O, NEXT + DRAFTS + [click("Edit Next week plan"), wait(900)], fail=[{"path": r"/schedule/edit-lock/acquire$", "method": "POST", "status": 403, "reason": "authz.out_of_scope"}]),
], part="New Schedule penceresi · Schedules")

extend("3.0", [
    sc("edit-live", "Yayındaki haftayı düzenleme (Edit live schedule): kartlar canlı, Unassigned satırı", O, LIVE),
    sc("edit-draft", "Kayıtlı taslağı düzenleme (Edit Next week plan)", O, NEXT_DRAFT_EDIT),
    sc("edit-one-location", "Yalnız bir lokasyonu düzenleme: Downtown süzülüyken Edit live schedule", O,
       [click("All locations"), click("Harbor & Vine Downtown", within='[data-topbar-filter-content="locations"]'), key("Escape"), wait(400)] + LIVE),
    sc("edit-resume", "Sayfa yenilenince düzenlemeye devam (?mode=edit)", O, path="/app/schedule?mode=edit"),
    sc("edit-other-week", "Düzenlerken başka haftaya geçip geri dönme", O, LIVE + NEXT + PREV),
    sc("discard-quiet", "Discard: değişiklik yoksa sormadan çıkış", O, LIVE + [click("Discard"), wait(700)]),
    sc("discard-confirm", "Discard onayı: \"Discard unsaved changes?\"", O, BLANK + [CL(addbtn("carlos", 0)), wait(700), click("Add shift", within='[role="dialog"]'), wait(1200), click("Discard", within='[role="toolbar"]')]),
    sc("other-viewer", "Başka bakan var: \"1 other viewer · Viewing this schedule\"", O, setup="schedule-other-viewer"),
    sc("other-editor", "Başka düzenleyen var: \"Someone is editing this schedule\"", O, setup="schedule-other-editor"),
], part="Düzenleme · giriş ve çubuk")

extend("3.0", [
    sc("locked", "Kilit: \"Draft is being edited\" (Rachel Adams düzenliyor; View schedule / Try again)", O, LIVE, setup="schedule-locked"),
    sc("idle-warning", "Boşta kalma uyarısı: Keep editing? geri sayım, SAVE / CONTINUE", O, LIVE + [wait(2500)], setup="schedule-idle-warning"),
    sc("idle-expired", "Süre doldu: değişiklik Auto-save taslağı oldu (taslak listesinde)", O, BLANK + [CL(addbtn("carlos", 0)), wait(700), click("Add shift", within='[role="dialog"]'), wait(7500)] + DRAFTS, setup="schedule-idle-expire"),
    sc("recovered", "Yarım kalan düzenleme ayrı taslak oldu (\"Unsaved changes were saved as a separate draft\"; listede Auto-save taslağı)", O, LIVE + [wait(800)] + DRAFTS, setup="schedule-lapsed-edit"),
    sc("edit-closed", "Düzenleme başka yerde kapandı: \"Your edit ended while you were away…\"", O,
       BLANK + [CL(addbtn("carlos", 0)), wait(700), click("Add shift", within='[role="dialog"]'), wait(1200), click("Publish"), wait(400), click("Save", within=".schedule-save-draft-menu"), wait(1200)], setup="schedule-save-closed"),
    sc("edit-stale", "Başka sekmede değişmiş: \"This schedule changed in another tab…\" + Reload", O,
       BLANK + [CL(addbtn("carlos", 0)), wait(700), click("Add shift", within='[role="dialog"]'), wait(1200)], setup="schedule-shift-stale"),
], part="Kilit ve süre aşımı pencereleri")

# Grid: headers, rows, cells.
ADD_CARLOS = BLANK + [CL(addbtn("carlos", 0)), wait(700)]
SAVE_EDITOR = [click("Add shift", within='[role="dialog"]'), wait(1200)]
GRID = "Izgara · başlıklar, satırlar, hücreler"
extend("3.0", [
    sc("today", "Bugünün gün başlığı vurgulu", O, [act("hover", '[aria-label^="View Mon"]')]),
    sc("unpublished-dot", "Yayınlanmamış hafta: lokasyon başlığında \"Unpublished\" noktası", O, NEXT2),
    sc("deadline", "Bu hafta yayında değil: lokasyon noktası kırmızı (ipucu: \"Schedule week is underway…\")", O, setup="schedule-this-week-unpublished"),
    sc("deadline-lead", "Yayınlayamayan rolde son gün uyarısı yok (Shift Lead)", C, setup="schedule-this-week-unpublished"),
    sc("partial-time-off", "Kısmi izin hücresi (Noah Garcia, Thu 3 PM sonrası): kırmızı zemin, Add shift var", O, LIVE + [act("scroll", cell("noah", 3))]),
    sc("drag-time-off", "İzinli hücreye sürükleme anı: \"Can't place a shift here\"", O, LIVE + [act("drag", card("maria", 1), to=cell("maria", 2), hold=True)]),
    sc("closed-day", "Kapalı gün (Kitchen deep clean, gelecek Salı): başlıkta kilit, hücreler kapalı", O, NEXT + [act("hover", '[aria-label^="Closed:"]')]),
    sc("short-day", "Kısa saatli gün (Hartwell private buyout, Uptown): başlıkta \"Short hours\" satırı", O, NEXT + [act("hover", '.schedule-day-post[data-day="short"]')]),
    sc("unassigned", "Unassigned satırı: \"3 open shifts\"", O, LIVE),
    sc("stack", "Unassigned yığını \"x3\": Count 3 ile eklenen aynı açık vardiyalar", O, LIVE + [CL(addbtn(None, 2)), wait(700), click("Increase count"), click("Increase count"), click("Add 3 shifts"), wait(1500)]),
    sc("employee-drawer", "Çalışan adına tık: çalışan çekmecesi (Maria Lopez)", O, [click("Maria Lopez", within="main")]),
    sc("logo", "Logo çerçevesi: \"Manage schedule logo\" (owner)", O, [act("hover", '[aria-label="Manage schedule logo"]')]),
    sc("logo-manager", "Müdürde logo tıklanmaz", M, [act("hover", '.schedule-logo-frame, [aria-label$=" logo"]')]),
    sc("no-employees", "Hiç çalışan yok: yalnız dolgu satırları", O, setup="schedule-no-employees"),
    sc("h-scroll", "Yatay kaydırma çubuğu: sağ uca kaydırılmış ızgara (Uptown)", O, [act("key", '[aria-label="Scroll schedule horizontally"]', key="End"), wait(500)]),
    sc("total-hours-note", "Toplam satırı: \"Includes reference estimates.\" (yayınsız hafta)", O, NEXT + SETTINGS + [click("Show Total hours"), key("Escape")]),
], part=GRID)

CARDP = "Vardiya kartı ve rozetleri"
extend("3.0", [
    sc("card-variants", "Kartta etiket, gece yarısını geçen \"+1\", saati gizli kart, not köşesi", O, setup="schedule-card-variants"),
    sc("note-card", "Not köşesi: üzerine gelince not kartı (Carlos Rivera, Mon)", O, [act("hover", card("carlos", 0))], setup="schedule-card-variants"),
    sc("avail-mark", "Uygunluk \"!\": adın yanında ve boş hücrede (düzenlemede, Availability on)", O, LIVE),
    sc("avail-popup", "Uygunluk \"!\" penceresi", O, LIVE + [click(".schedule-availability-mark")]),
    sc("avail-off", "Availability off: turuncu \"!\" gizli, kırmızı izin kalır", O, LIVE + [click("Availability on"), wait(400)]),
    sc("changed-after", "Kartta \"!\" ve \"Changed after publishing\" (Priya Patel, Tue)", O, LIVE + [act("scroll", card("priya", 1)), wait(300), CL(card("priya", 1) + " .schedule-availability-mark-card"), wait(500)], setup="schedule-changed-after-publish"),
    sc("new-mark", "Düzenlemede yeni vardiya: \"New\" işareti", O, ADD_CARLOS + SAVE_EDITOR),
    sc("staged", "Yayındaki vardiya kaldırılmak üzere: \"Staged for removal\"", O, LIVE + [act("context", card("carlos", 1)), click("Unpublish shift"), wait(900), act("hover", card("carlos", 1))]),
    sc("edited", "Değiştirilen canlı vardiya: \"Edited - updates the live shift on next publish\"", O, LIVE + [act("dblclick", card("carlos", 1)), wait(600), fill('textarea', "Cover the pass"), click("Save", within='[role="dialog"]'), wait(1200)]),
    sc("overlap", "Çakışan iki vardiya: hücrede çakışma işareti (Carlos, Mon)", O, LIVE + [CL(addbtn("carlos", 0)), wait(700), click("Breakfast", within='[role="group"][aria-label="Shift type"]'), click("Add shift", within='[role="dialog"]'), wait(1500)]),
    sc("saving", "Kartta \"Saving\" / \"Still saving — please wait\" (taşıma cevap bekliyor)", O, LIVE + [act("drag", card("daniel", 1), to=cell("daniel", 2)), wait(4500)], hold=[r"/shifts/[0-9a-f-]+$"]),
], part=CARDP)

SEL = "Seçim, kopyala-yapıştır, sürükle"
extend("3.0", [
    sc("multi-select", "Ctrl+tık ile çoklu seçim: \"Delete 2\"", O, LIVE + [act("click", card("carlos", 0), ctrl=True), act("click", card("carlos", 1), ctrl=True)]),
    sc("select-all", "Ctrl+A: görünen vardiyaların hepsi seçili", O, LIVE + [key("a", cell("carlos", 5), ctrl=True)]),
    sc("delete-selected", "Seçileni silme onayı: \"Delete selected shifts?\"", O, LIVE + [act("click", card("carlos", 0), ctrl=True), act("click", card("carlos", 1), ctrl=True), key("Delete", cell("carlos", 5))]),
    sc("delete-selected-done", "Seçilenler silindi: kaldırılmak üzere işaretli", O, LIVE + [act("click", card("carlos", 0), ctrl=True), act("click", card("carlos", 1), ctrl=True), key("Delete", cell("carlos", 5)), click("Delete", within='[role="alertdialog"], [role="dialog"]'), wait(900)]),
    sc("copy", "Kopyala (Ctrl+C): \"Shift copied\", Paste mode on, durum satırı", O, LIVE + [act("click", card("carlos", 0), ctrl=True), wait(300), key("c", card("carlos", 0), ctrl=True), wait(300)]),
    sc("paste", "Hücreye yapıştır: \"Shift pasted\"", O, LIVE + [act("click", card("carlos", 0), ctrl=True), wait(300), key("c", card("carlos", 0), ctrl=True), wait(300), CL(cell("carlos", 5)), wait(1500)]),
    sc("paste-empty", "Pano boşken Ctrl+V: \"Copy a shift first\"", O, LIVE + [key("v", cell("carlos", 5), ctrl=True)]),
    sc("copy-many", "Birden çok seçiliyken Ctrl+C: \"Select one shift to copy\"", O, LIVE + [act("click", card("carlos", 0), ctrl=True), act("click", card("carlos", 1), ctrl=True), key("c", card("carlos", 1), ctrl=True)]),
    sc("paste-blocked", "Yapıştırma engellendi: izinli güne (Maria Lopez, Wed) \"Paste blocked\" + kural kutusu", O, LIVE + [act("click", card("maria", 1), ctrl=True), wait(300), key("c", card("maria", 1), ctrl=True), wait(300), CL(cell("maria", 2)), wait(1500)]),
    sc("drag-move", "Sürükle-bırak ile taşıma (Daniel Kim, Tue → Wed)", O, LIVE + [act("drag", card("daniel", 1), to=cell("daniel", 2)), wait(1500)]),
    sc("drag-copy", "Ctrl ile sürükleyip kopyalama (Daniel Kim, Tue → Wed)", O, LIVE + [act("drag", card("daniel", 1), to=cell("daniel", 2), ctrl=True), wait(1500)]),
    sc("new-mark-avail", "Uygun olmayan saate kopyalanan yeni vardiya: \"!\" ve NEW yan yana (Aisha Johnson, Thu → Fri, Ctrl ile)", O, LIVE + [act("drag", card("aisha", 3), to=cell("aisha", 4), ctrl=True), wait(1500), click(".schedule-conflict-sheet-body button.primary"), wait(1500)]),
    sc("drop-warning", "Uyarılı bırakma: \"Schedule this shift anyway?\" (Aisha Johnson, Thu → Fri akşamı, uygun değil)", O, LIVE + [act("drag", card("aisha", 3), to=cell("aisha", 4)), wait(1500)]),
    sc("drop-blocked", "Engelli bırakma: \"Resolve this conflict before changing the shift.\" (Noah Garcia, Fri → Thu izni)", O, LIVE + [act("drag", card("noah", 4), to=cell("noah", 3)), wait(1500)]),
    sc("preset-click", "Preset çipine tık: Unassigned satırına yeni açık vardiya (New)", O, LIVE + SETTINGS + [click("Job/Position"), key("Escape"), wait(300), CL('[data-schedule-preset-chip="true"]:not([disabled])'), wait(800)]),
    sc("preset-drag", "Preset çipini hücreye sürükleme (Dinner-Barback → Daniel Kim, Wed)", O, LIVE + SETTINGS + [click("Job/Position"), key("Escape"), wait(300), act("drag", '[data-schedule-preset-chip="true"][aria-label^="Dinner-Barback"]', to=cell("daniel", 2)), wait(1500)]),
    sc("preset-unavailable", "Preset kullanılamaz: \"Preset shift is unavailable\" (Dinner-Server çipi → Maria Lopez, izinli Wed)", O, LIVE + SETTINGS + [click("Job/Position"), key("Escape"), wait(300), act("drag", '[data-schedule-preset-chip="true"][aria-label^="Dinner-Server"]', to=cell("maria", 2)), wait(600)]),
], part=SEL)

UNDO = "Geri al · Undo"
extend("3.0", [
    sc("undo", "Geri al: \"Last edit undone\"", O, ADD_CARLOS + SAVE_EDITOR + [click("Undo", within='[role="toolbar"]'), wait(1200)]),
    sc("undo-refused", "Geri alınamayan adım: \"Last edit can't come back\"", O, ADD_CARLOS + SAVE_EDITOR + [click("Undo", within='[role="toolbar"]'), wait(1200)], setup="schedule-undo-refused"),
    sc("undo-stale", "Geri al başarısız: \"This page is out of date. Reload it, then press Undo again.\"", O, ADD_CARLOS + SAVE_EDITOR + [click("Undo", within='[role="toolbar"]'), wait(1200)], setup="schedule-undo-stale"),
    sc("change-refused", "Değişiklik kaydedilemedi: \"Schedule change could not be saved\"", O, ADD_CARLOS + SAVE_EDITOR, setup="schedule-shift-refused"),
], part=UNDO)

MENU = "Sağ tık menüleri"
extend("3.0", [
    sc("menu-new", "Yeni vardiyada sağ tık: Edit, Copy, Delete shift", O, ADD_CARLOS + SAVE_EDITOR + [act("context", card("carlos", 0))]),
    sc("menu-live", "Yayındaki vardiyada sağ tık: Unpublish shift", O, LIVE + [act("context", card("carlos", 1))]),
    sc("menu-restore", "Kaldırılacak vardiyada \"Restore shift\" → \"Shift restored\"", O, LIVE + [act("context", card("carlos", 1)), click("Unpublish shift"), wait(900), wait(400), act("context", card("carlos", 1)), wait(400), click("Restore shift"), wait(1500)]),
    sc("menu-cell", "Boş hücrede sağ tık: Paste shift", O, LIVE + [act("context", cell("carlos", 5))]),
    sc("menu-cell-presets", "Boş hücrede sağ tık (Job/Position): Paste shift + preset'ler", O, LIVE + SETTINGS + [click("Job/Position"), key("Escape"), wait(300), act("context", cell("carlos", 5))]),
    sc("escape-layers", "Escape bir katman kapatır: menü kapanır, seçim kalır", O, LIVE + [act("click", card("carlos", 0), ctrl=True), act("context", card("carlos", 1)), key("Escape")]),
], part=MENU)

ED = "Vardiya penceresi · Add / Edit shift"
UNASSIGNED_ADD = LIVE + [CL(addbtn(None, 2)), wait(700)]
extend("3.0", [
    sc("editor-unassigned", "Open satırına ekleme (Form görünümü): Who seçici ve How many", O, UNASSIGNED_ADD),
    sc("editor-count", "Count 3: not kapalı, \"Add 3 shifts\"", O, UNASSIGNED_ADD + [click("Increase count"), click("Increase count")]),
    sc("editor-employee-list", "Who seçici açık: Open ve kişiler Free / Busy / Unavailable / Time off ipucuyla, boş olanlar önce", O, UNASSIGNED_ADD + [click('[role="combobox"][aria-label="Employee"]')]),
    sc("editor-no-qualified", "Job: \"No employees qualified for this job.\" (Manager)", O, UNASSIGNED_ADD + [click('[role="combobox"][aria-label="Job"]'), click('[role="option"]:last-child')]),
    sc("editor-edit", "Vardiyayı düzenleme (çift tık): pencere kartın yanında, kart nefes alır, değişiklik yokken Save soluk", O, LIVE + [act("dblclick", card("carlos", 1)), wait(600)]),
    sc("editor-time-error", "Saat hatası: Start ile End aynı", O, ADD_CARLOS + [fill('input[aria-label="Start time"]', "11:00 AM"), fill('input[aria-label="End time"]', "11:00 AM"), click("Add shift", within='[role="dialog"]')]),
    sc("editor-time-empty", "Saat hatası: \"Enter start and end time.\"", O, ADD_CARLOS + [fill('input[aria-label="Start time"]', ""), click("Add shift", within='[role="dialog"]')]),
    sc("editor-24h", "24 saat biçimiyle saat girişi", O, ADD_CARLOS, setup="schedule-24h"),
    sc("editor-labels", "Etiket seçici açık", O, ADD_CARLOS + [click('[role="combobox"][aria-label="Labels"], button[aria-label="Labels"]')]),
    sc("editor-note", "Not yazma: \"N characters left\"", O, ADD_CARLOS + [fill("textarea", "Covering the patio section tonight.")]),
    sc("editor-checking", "Kaydederken \"Checking availability…\"", O, ADD_CARLOS + [click("Add shift", within='[role="dialog"]')], hold=[r"/availability/shift-assessment$"]),
    sc("editor-check-failed", "Uygunluk kontrol edilemedi: \"Availability could not be checked\"", O, ADD_CARLOS + SAVE_EDITOR, fail=[{"path": r"/availability/shift-assessment$", "method": "POST", "status": 500}]),
    sc("editor-stale", "Bayat vardiya: \"Shift changed\" + Close & reload", O, LIVE + [act("dblclick", card("carlos", 1)), wait(600), fill("textarea", "Cover the pass"), click("Save", within='[role="dialog"]'), wait(1200)], setup="schedule-patch-stale"),
    sc("editor-delete", "Pencereden silme: iki tık (Confirm delete)", O, LIVE + [act("dblclick", card("carlos", 1)), wait(600), click("Delete shift", within='[role="dialog"]'), wait(200)]),
    sc("editor-move", "Pencereyi başlıktan sürükleme", O, ADD_CARLOS + [act("drag", '[role="dialog"] header, [role="dialog"] [data-drag-handle], [role="dialog"] h2', to=cell("luis", 5))]),
    sc("editor-add-form", "Add shift penceresi (Form): hücrenin yanında, başlık altında kişi · gün · lokasyon; hücre yeşil çerçeveli", O, ADD_CARLOS),
    sc("editor-timeline", "Timeline görünümü: gün şeridi, her kişi bir satır, vardiya çubuğu", O, ADD_CARLOS + [click('[role="radio"][aria-label="Timeline"]'), wait(500)]),
    sc("editor-timeline-open", "Timeline'da Open satırına ekleme: \"Open\" satırı = herkes", O, UNASSIGNED_ADD + [click('[role="radio"][aria-label="Timeline"]'), wait(500)]),
    sc("editor-timeline-edit", "Timeline'da düzenleme: çubuğu ok tuşuyla 1 saat kaydırma (Shift+ok)", O, LIVE + [act("dblclick", card("carlos", 1)), wait(600), click('[role="radio"][aria-label="Timeline"]'), wait(500), click('[aria-label^="Shift time."]'), key("Shift+ArrowRight")]),
    sc("editor-paste", "Paste shift penceresi: kopyalanan vardiya boş hücreye", O, LIVE + [act("context", card("carlos", 1)), click("Copy"), wait(300), act("context", cell("carlos", 5)), click("Paste shift"), wait(700)]),
    sc("editor-closed-day", "Kapalı güne vardiya: kural kutusu (Kitchen deep clean, gelecek Salı)", O, NEXT + BLANK + [CL(addbtn("carlos", 8)), wait(700), click("Add shift", within='[role="dialog"]'), wait(1500)]),
], part=ED)

RULE = "Kural kutusu · Scheduling rule"
extend("3.0", [
    sc("rule-warn", "Uyarılı kayıt: düzenleyicide satır içi uyarı \"The assignment overlaps unavailable hours.\" (Priya Patel, Mon sabah)", O, BLANK + [CL(addbtn("priya", 0)), wait(700), click("Lunch", within='[role="group"][aria-label="Shift type"]'), click("Add shift", within='[role="dialog"]'), wait(1500)]),
    sc("rule-block", "Engelli kayıt (onaylı izin): yalnız Cancel (Noah Garcia, Thu akşam)", O, BLANK + [CL(addbtn("noah", 3)), wait(700), click("Dinner", within='[role="group"][aria-label="Shift type"]'), click("Add shift", within='[role="dialog"]'), wait(1500)]),
], part=RULE)

# Saving a draft (Publish ▾ / Save draft).
SAVEP = "Taslak kaydetme · Save draft"
SAVE_MENU = [click('[data-schedule-top-action-trigger="publish"], [data-schedule-top-action-trigger="save-draft"]'), wait(400)]
MENU_SAVE = [click("Save", within=".schedule-save-draft-menu"), wait(1500)]
NEXT_ADD = NEXT_DRAFT_EDIT + [CL(addbtn("daniel", 9)), wait(700)] + SAVE_EDITOR
def file(sel, name, type, size=None):
    d = {"file": sel, "name": name, "type": type}
    if size: d["size"] = size
    return d
extend("3.0", [
    sc("save-menu", "Publish ▾ menüsü: taslak adı, Save / Save As / Save and publish, kayıtlı taslaklar", O, NEXT_ADD + SAVE_MENU),
    sc("save-version", "Canlı haftanın çalışma kopyası: önerilen \"vrs.0.1\" adı", O, LIVE + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR + SAVE_MENU),
    sc("save-live-name", "Canlı yayının adı yazılınca: \"The live schedule name is reserved…\"", O, LIVE + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR + SAVE_MENU + [fill("#schedule-save-draft-name", "Published schedule")]),
    sc("save-same-name", "Başka taslağın adı: \"A draft with this name already exists…\" ve satırda Overwrite", O, NEXT + BLANK + [CL(addbtn("daniel", 9)), wait(700)] + SAVE_EDITOR + SAVE_MENU + [fill("#schedule-save-draft-name", "Next week plan")]),
    sc("save-overwrite", "Satırdan üzerine yazma: iki tık (onay işareti)", O, NEXT + BLANK + [CL(addbtn("daniel", 9)), wait(700)] + SAVE_EDITOR + SAVE_MENU + [click('[aria-label="Overwrite Next week plan"]')]),
    sc("save-done", "Kaydedildi: önizlemeye dönüş, taslak menüsünde \"Viewing\"", O, NEXT_ADD + SAVE_MENU + MENU_SAVE + DRAFTS),
    sc("save-shift-lead", "Yayınlayamayan rol (Shift Lead): \"Save draft\" menüsü, Save and publish yok", C, LIVE + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR + SAVE_MENU),
    sc("save-owned", "Başkasının taslağı: \"Overwrite \"Next week plan\"?\" onayı (Rachel Adams'ın)", O, NEXT_ADD + SAVE_MENU + MENU_SAVE, setup="schedule-save-owned"),
    sc("save-stale", "Taslak bu arada başka yerde kaydedilmiş: kurtarma sayfası", O, NEXT_ADD + SAVE_MENU + MENU_SAVE, setup="schedule-save-stale"),
    sc("save-failed", "Kayıt başarısız: \"Schedule save failed\" (Retry save / Keep editing / Discard)", O, NEXT_ADD + SAVE_MENU + MENU_SAVE, setup="schedule-save-fails"),
    sc("save-failed-discard", "Kurtarmada Discard: iki tık", O, NEXT_ADD + SAVE_MENU + MENU_SAVE + [wait(1200), click("Discard", within='[aria-labelledby="schedule-save-recovery-title"], .schedule-save-recovery')], setup="schedule-save-fails"),
    sc("save-exchange", "Kurtarmada onaylı vardiya değişimi: \"Use approved assignments\"", O, LIVE + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR + SAVE_MENU + [fill("#schedule-save-draft-name", "Week with swap"), click("Save As", within=".schedule-save-draft-menu"), wait(1500)], setup="schedule-save-exchange"),
    sc("save-exchange-done", "Onaylı atamalar geri geldi: \"Approved assignments restored\"", O, LIVE + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR + SAVE_MENU + [fill("#schedule-save-draft-name", "Week with swap"), click("Save As", within=".schedule-save-draft-menu"), wait(1500)] + [click("Use approved assignments"), wait(1200)], setup="schedule-save-exchange"),
    sc("save-past-confirm", "Başlamış vardiyaya dokunan kayıt: \"This changes shifts that already ran\"", O, NEXT_ADD + SAVE_MENU + MENU_SAVE, setup="schedule-save-past-confirm"),
    sc("save-past-blocked", "Geçmiş hafta kaydı: \"These changes cannot be saved\"", O, NEXT_ADD + SAVE_MENU + MENU_SAVE, setup="schedule-save-past-blocked"),
], part=SAVEP)

# Publish wizard.
PUBP1 = "Yayınla sihirbazı · Publish: adım 1"
PUBP2 = "Yayınla sihirbazı · Publish: ön kontrol"
PUBP3 = "Yayınla sihirbazı · Publish: bildirim ve sonuç"
OPEN_PUB = [click("Published"), click("Publish another draft"), wait(1500)]
PUB = NEXT_DRAFT_VIEW + OPEN_PUB
def view_draft(name): return NEXT + DRAFTS + [click(f'[aria-label="View {name}"]'), wait(900)]
STEP2 = [click("Next", within='[role="dialog"]'), wait(1200)]
STEP3 = STEP2 + [click("Next", within='[role="dialog"]'), wait(600)]
PUBLISH1 = [click("Publish", within='[role="dialog"]'), wait(1500)]
extend("3.0", [
    sc("publish-step1", "Adım 1: taslak, departmanlar, lokasyon ve değişiklik sayıları", O, PUB),
    sc("publish-remove-all", "Bütün canlı vardiyalar silinecek uyarısı (boş taslak)", O, view_draft("Closed for renovation") + OPEN_PUB, setup="schedule-empty-draft"),
    sc("publish-no-changes", "\"No changes to publish\" (taslak zaten yayında)", O, PUB, setup="schedule-next-plan-live"),
    sc("publish-no-department", "Departman seçilmedi: \"Select at least one department to publish.\"", O, PUB + [click("Bar", within='[role="dialog"]'), click("Management", within='[role="dialog"]'), click("Front of House", within='[role="dialog"]'), click("Kitchen", within='[role="dialog"]'), click("No department", within='[role="dialog"]'), wait(500)]),
    sc("publish-changed-since", "Taslak başladıktan sonra lokasyon yayınlanmış: \"… published this location …\"", O, PUB, setup="schedule-publish-changed"),
    sc("publish-preview-loading", "Önizleme yükleniyor: gri satırlar", O, NEXT_DRAFT_VIEW + [click("Published"), click("Publish another draft"), wait(400)], hold=[r"/schedule/publish-preview$"]),
    sc("publish-preview-error", "Önizleme okunamadı: We couldn't load the publish preview + Try again", O, PUB, fail=[{"path": r"/schedule/publish-preview$", "method": "POST", "status": 500}]),
    sc("publish-manager", "Müdürün yayını: yalnız Downtown", M, PUB),
    sc("publish-save-and", "Düzenlemeden \"Save and publish\": sihirbaz yeni taslakla açılır", O, LIVE + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR + SAVE_MENU + [fill("#schedule-save-draft-name", "Saturday cover"), click("Save and publish"), wait(2000)]),
], part=PUBP1)
extend("3.0", [
    sc("publish-ready", "Adım 2: \"Ready to publish\"", O, PUB + STEP2),
    sc("publish-blocker", "Engel: \"Must be fixed in the schedule\", Next pasif", O, PUB + STEP2, setup="schedule-publish-blocker"),
    sc("publish-warnings", "Geçilebilir engel: \"Warnings to review\"", O, PUB + STEP2, setup="schedule-publish-warning"),
    sc("publish-risks", "\"Risks\" (14 günden kısa bildirim)", O, PUB + STEP2, setup="schedule-publish-risk"),
    sc("publish-availability", "Uygunluk: \"Current schedule conflicts\", katlanmış uygunsuzluk satırı, \"Previously accepted\"", O, PUB + STEP2 + [click("Previously accepted"), click(".schedule-publish-availability-fold summary")], setup="schedule-publish-availability"),
    sc("publish-notes", "\"Notes and already-live issues\" (yayını durdurmaz)", O, PUB + STEP2, setup="schedule-publish-notes"),
    sc("publish-show-shift", "\"Show shift\": sihirbaz kapanır, vardiya düzenlemede açılır", O, PUB + STEP2 + [click('[aria-label^="Show Priya Patel"]'), wait(2000)], setup="schedule-publish-availability"),
], part=PUBP2)
extend("3.0", [
    sc("publish-notify", "Adım 3: bildirilecek kişiler, Select all / Clear all", O, PUB + STEP3),
    sc("publish-notify-search", "15+ kişide \"Search employees\"", O, view_draft("Full reshuffle") + OPEN_PUB + [wait(600)] + STEP3, setup="schedule-all-change-draft"),
    sc("publish-no-affected", "Yalnız açık vardiya değişti: \"No affected employees.\"", O, view_draft("Extra open shift") + OPEN_PUB + [click("Harbor & Vine Uptown", within=".schedule-publication-locations"), wait(1200)] + STEP3, setup="schedule-open-only-draft"),
    sc("publish-done", "Yayınlandı: \"Schedule published\"", O, PUB + STEP3 + PUBLISH1),
    sc("publish-notified", "Yayınlandı, \"6 employees notified\"", O, PUB + STEP3 + PUBLISH1, setup="schedule-publish-notified"),
    sc("publish-notify-warning", "Yayınlandı ama bildirim gitmedi: uyarı", O, PUB + STEP3 + PUBLISH1, setup="schedule-publish-notify-warning"),
    sc("publish-stale", "Yayın sırasında canlı program değişmiş: adım 1'e dönüş + uyarı", O, PUB + STEP3 + PUBLISH1, setup="schedule-publish-stale"),
    sc("publish-conflicts", "\"Schedule conflicts must be fixed before publishing\" + Review document", O, PUB + STEP3 + PUBLISH1, setup="schedule-publish-conflicts"),
    sc("publish-refreshed", "Uyarılar yenilendi: ön kontrole dönüş (\"The schedule changed while this dialog was open…\")", O, PUB + STEP3 + PUBLISH1, setup="schedule-publish-refreshed"),
    sc("publish-continued", "Uyarılar yenilendi ve yayın sürdü: \"Schedule warnings cleared\"", O, PUB + STEP3 + PUBLISH1, setup="schedule-publish-continued"),
], part=PUBP3)

UNP = "Yayından kaldır · Unpublish"
UNPUB = [click("Published"), click("Unpublish schedule"), wait(1000)]
PICK2 = [click("Harbor & Vine Downtown", within='[aria-labelledby="schedule-unpublish-title"]'), click("Harbor & Vine Uptown", within='[aria-labelledby="schedule-unpublish-title"]'), wait(300)]
extend("3.0", [
    sc("unpublish-picked", "İki lokasyon seçili: silinecek vardiyalar ve \"Unpublish 2 locations\"", O, UNPUB + PICK2),
    sc("unpublish", "Unpublish penceresi: lokasyonlar, silinecek vardiya sayısı, etkiler", O, UNPUB),
    sc("unpublish-confirm", "Unpublish iki tık: \"Confirm unpublish\"", O, UNPUB + PICK2 + [click("Unpublish 2 locations")]),
    sc("unpublish-done", "Kaldırıldı: \"Schedule unpublished\"", O, UNPUB + PICK2 + [click("Unpublish 2 locations"), click(ARMED), wait(1500)]),
    sc("unpublish-from-draft", "Taslak menüsündeki geri ok ile Unpublish penceresi", O, NEXT + DRAFTS + [click('[aria-label="Unpublish schedule"]'), wait(1000)], setup="schedule-next-plan-live"),
    sc("unpublish-refresh-failed", "Kaldırıldı ama sayfa yenilenemedi: hata şeridi", O, UNPUB + PICK2 + [click("Unpublish 2 locations"), click(ARMED), wait(1800)], fail=[{"path": r"/schedule/drafts$", "method": "GET", "status": 500}]),
], part=UNP)

TPL = "New Schedule penceresi · Templates"
extend("3.0", [
    sc("templates-tab", "Templates sekmesi: şablonlar, Use ve ⋯ menüsü (Rename, Delete)", O, TAB_TEMPLATES),
    sc("templates-create", "Taslaktan şablon: Save template formu, \"Template saved\"", O, NEXT + TAB_TEMPLATES + SAVE_TEMPLATE_FORM + [fill(f"{TPL_FORM} select", "00000801-0000-4000-8000-000000000801"), fill(f'{TPL_FORM} input:not([type="checkbox"])', "Fall weekdays"), click("Save template", within=TPL_FORM), wait(1200)]),
    sc("templates-duplicate", "Aynı adlı şablon: hata", O, NEXT + TAB_TEMPLATES + SAVE_TEMPLATE_FORM + [fill(f"{TPL_FORM} select", "00000801-0000-4000-8000-000000000801"), fill(f'{TPL_FORM} input:not([type="checkbox"])', "Standard week"), click("Save template", within=TPL_FORM), wait(1200)]),
    sc("templates-use-target", "Düzenleme yokken Use: önce hangi schedule'a gireceği (ekrandaki seçili, New blank draft)", O, TAB_TEMPLATES + [click("Use template Standard week"), wait(300)]),
    sc("templates-use-open", "Hedef seçilip \"Open for editing\": düzenleme açılır, pencere Add / Replace adımına döner", O, TAB_TEMPLATES + [click("Use template Standard week"), click("Open for editing"), wait(2200)]),
    sc("templates-apply-blank", "Boş taslağa uygulama: \"Apply template\"", O, NEXT2 + BLANK + TAB_TEMPLATES + [click("Use template Standard week"), click("Apply template"), wait(1500)]),
    sc("templates-merge", "Dolu programa ekleme: \"Add to current shifts\"", O, LIVE + TAB_TEMPLATES + [click("Use template Downtown open shifts"), click("Add to current shifts"), wait(1500)]),
    sc("templates-replace", "Değiştirerek: \"Confirm replace\" ve silinecek vardiya sayısı", O, LIVE + TAB_TEMPLATES + [click("Use template Downtown open shifts"), click("Replace current shifts"), wait(800)]),
    sc("templates-departments", "Yalnız bazı departmanlar", O, LIVE + TAB_TEMPLATES + [click("Use template Standard week"), click("Only some departments"), click("Bar", within="[data-apply-template-departments]")]),
    sc("templates-archived-label", "Arşivlenmiş etiket atlandı: uyarı tonunda \"Template applied\"", O, NEXT2 + BLANK + TAB_TEMPLATES + [click("Use template Downtown open shifts"), click("Apply template"), wait(1500)], setup="schedule-template-archived-label"),
    sc("templates-apply-failed", "Şablon uygulanamadı", O, NEXT2 + BLANK + TAB_TEMPLATES + [click("Use template Standard week"), click("Apply template"), wait(1500)], fail=[{"path": r"/apply-template$", "method": "POST", "status": 500}]),
], part=TPL)

AF = "Auto-fill"
AUTOFILL = LIVE + [click("Auto-fill"), wait(1500)]
extend("3.0", [
    sc("autofill", "Auto-fill öneri listesi", O, AUTOFILL),
    sc("autofill-reject", "Reject ve \"Leave open\"", O, AUTOFILL + [click('[aria-label^="Reject"]'), fill('.schedule-autofill-item:last-child select', "")]),
    sc("autofill-empty", "Öneri yok (boş taslak)", O, BLANK + [click("Auto-fill"), wait(1500)]),
    sc("autofill-applied", "Uygulandı: \"Applied N shifts\"", O, AUTOFILL + [click('[role="dialog"] .schedule-dialog-actions .primary'), wait(1500)]),
    sc("autofill-rejected", "Sunucu reddetti: \"N auto-fill assignments could not be applied\"", O, AUTOFILL + [click('[role="dialog"] .schedule-dialog-actions .primary'), wait(1500)], setup="schedule-autofill-rejects"),
    sc("autofill-stale", "Bayat inceleme: \"The schedule changed after this review opened…\"", O, AUTOFILL + [click('[role="dialog"] .schedule-dialog-actions .primary'), wait(1500)], fail=[{"path": r"/auto-fill-apply$", "method": "POST", "status": 409, "reason": "schedule.auto_fill_stale"}]),
], part=AF)

DH = "Varsayılan saatler · Review default hours"
DHOURS = [click("Review default hours"), wait(800)]
DH_REVIEW = [click('[aria-labelledby="default-hours-title"] .schedule-tool-dialog > button'), wait(1200)]
extend("3.0", [
    sc("default-hours", "Close'un yeni saatleri: karşılaştırma ve Apply", O, LIVE + DHOURS + [fill('[aria-labelledby="default-hours-title"] select', "00000404-0000-4000-8000-000000000404")] + DH_REVIEW),
    sc("default-hours-applied", "Uygulandı: Close vardiyaları yeni saatte", O, LIVE + DHOURS + [fill('[aria-labelledby="default-hours-title"] select', "00000404-0000-4000-8000-000000000404")] + DH_REVIEW + [click('[aria-label="Default hours comparison"] > button'), wait(1500)]),
    sc("default-hours-empty", "Aralıkta vardiya yok: \"No saved reference-hour shifts in this range.\"", O, BLANK + DHOURS),
    sc("default-hours-stale", "İnceleme eskidi: \"This review is out of date…\"", O, LIVE + DHOURS + [fill('[aria-labelledby="default-hours-title"] select', "00000404-0000-4000-8000-000000000404")] + DH_REVIEW + [click('.default-hours-selection input[type="checkbox"]'), wait(300)]),
    sc("default-hours-blocked", "Engelli satır: izinle çakışan Close (Noah Garcia), Apply pasif", O, LIVE + DHOURS + [fill('[aria-labelledby="default-hours-title"] select', "00000404-0000-4000-8000-000000000404")] + DH_REVIEW, setup="schedule-default-hours-blocked"),
], part=DH)

LOGO = "Logo · Schedule logo"
LOGO_OPEN = [click('[aria-label="Manage schedule logo"]'), wait(600)]
LOGO_FILE = '[aria-label="Upload schedule logo file"]'
extend("3.0", [
    sc("logo-dialog", "Logo penceresi (Upload, ölçek ve konum pasif)", O, LOGO_OPEN),
    sc("logo-upload", "Yüklenen logo: önizleme, Scale 1.60x", O, LOGO_OPEN + [file(LOGO_FILE, "harbor-vine.png", "image/png"), wait(500), fill('input[aria-label="Scale"]', "1.6")]),
    sc("logo-saved", "Kaydedildi: ızgaranın köşesinde logo", O, LOGO_OPEN + [file(LOGO_FILE, "harbor-vine.png", "image/png"), wait(500), click("Save", within=".schedule-logo-dialog, [role=dialog]"), wait(1500)]),
    sc("logo-wrong-type", "Yanlış biçim: \"Use an SVG, PNG, JPEG, or WebP image.\"", O, LOGO_OPEN + [file(LOGO_FILE, "menu.pdf", "application/pdf")]),
    sc("logo-too-big", "Büyük dosya: \"Logo must be 5 MB or smaller.\"", O, LOGO_OPEN + [file(LOGO_FILE, "poster.png", "image/png", 6 * 1024 * 1024)]),
    sc("logo-save-failed", "Kaydedilemedi: \"Logo could not be saved.\"", O, LOGO_OPEN + [file(LOGO_FILE, "harbor-vine.png", "image/png"), wait(500), click("Save", within=".schedule-logo-dialog, [role=dialog]"), wait(1500)], setup="schedule-logo-save-fails"),
], part=LOGO)

extend("3.0", [
    sc("editor-warned", "Kural uyarısıyla kaydedildi: \"Shift saved with a warning\"", O, BLANK + [CL(addbtn("carlos", 5)), wait(700)] + SAVE_EDITOR, setup="schedule-assess-warning"),
], part=ED)
extend("3.0", [
    sc("drop-note", "Müdür notlu saate bırakma: \"Manager note for Daniel Kim\"", O, LIVE + [act("drag", card("daniel", 1), to=cell("daniel", 2)), wait(1500)], setup="schedule-manager-note"),
], part=SEL)
extend("3.0", [
    sc("draft-delete-busy", "Taslak silinemedi: başkası düzenliyor", O, NEXT + DRAFTS + [click("Delete Next week plan"), click(ARMED), wait(800)], fail=[{"path": r"/schedule/drafts/[0-9a-f-]+$", "method": "DELETE", "status": 409, "reason": "schedule.draft_being_edited", "error": "Someone is editing this draft"}]),
], part="New Schedule penceresi · Schedules")

# ---------------------------------------------------------------- 3.1 Schedule export
# Export is the New Schedule window's third tab (Mert, 2026-10-12, design B):
# the grid as it is on screen, preview on the left, File, Send to and Layout on the right.
FILE = '[aria-label="File"]'
set_part("3.1", "Roller", ["owner", "manager"])
set_part("3.1", "Dosya · File", ["excel", "png"])
replace("3.1", "manager", sc("manager", "Manager · Rachel Adams: yalnız Downtown dışa aktarılır", M, part="Roller"))
replace("3.1", "excel", sc("excel", "Excel: \"One workbook: Merged, each location, and Data…\"", O, [click("Excel", within=FILE), wait(1500)], part="Dosya · File"))
replace("3.1", "png", sc("png", "Image: PNG, her sayfa bir resim", O, [click("Image", within=FILE), wait(2500)], part="Dosya · File"))
extend("3.1", [
    sc("no-export", "Export izni olmayan rol: /export düz Schedule'ı açar", C, perms=RO),
    sc("phone", "Telefonda kapalı (sağdaki telefon çerçevesi)", O),
], part="Roller")
extend("3.1", [
    sc("print", "Send to · Printer: kâğıt seçimi (US Letter / A4), \"Print PDF\"", O, [click("Printer"), wait(1500)]),
    sc("print-a4", "Printer, A4", O, [click("Printer"), click("A4", within='[aria-label="Paper"]'), wait(1500)]),
    sc("combine", "Download: \"Locations side by side\" kapalı, \"One long page\" açık", O, [click("Locations side by side"), wait(2500)]),
    sc("merged", "Birleşik görünümden export: tek tablo, \"All locations in one table.\"", O, path="/app/schedule/export?layout=unified", steps=[click("Printer"), wait(1500)]),
    sc("draft-source", "Ekrandaki taslak: \"Draft · Next week plan\"", O, path=f"/app/schedule/export?draft={eid(0x801)}", steps=[wait(1500)], setup="schedule-draft-this-week"),
    sc("editing", "Düzenleme açıkken: kaydetmeden, ekrandaki hâliyle (\"Editing · not saved\")", O, path="/app/schedule", steps=LIVE + TAB_EXPORT),
    sc("day-range", "Gün görünümünden export: tek gün", O, path="/app/schedule/export?view=day"),
], part="Sayfa düzeni ve kaynak")
extend("3.1", [
    sc("downloaded", "İndirildi: \"Last generated files\" listesi", O, [wait(2500), click(".export-v2-primary"), wait(8000), {"scroll": ".export-v2-downloads"}, wait(300)]),
    sc("download-again-failed", "Dosyayı yeniden kaydederken yetki reddedildi (403): hata satırı \"Not allowed\"", O, [wait(2500), click(".export-v2-primary"), wait(8000), click(".export-v2-downloads button"), wait(1200), {"scroll": ".export-v2-downloads"}, wait(300)], setup="schedule-export-recheck-fails"),
    sc("preparing", "Hazırlanıyor: \"Preparing…\"", O, [wait(2500), click(".export-v2-primary"), wait(500)], hold=[r"/export-v2/authorize$"]),
    sc("popup-blocked", "\"Open in a tab\" engellendi: \"Your browser blocked the preview tab…\"", O, [wait(2500), click("Open in a tab"), wait(500)], setup="schedule-popup-blocked"),
    sc("prefs-not-saved", "Ayar hatırlanamadı: \"These settings work for this session…\"", O, [click("Image", within=FILE), wait(500)], setup="schedule-export-prefs-blocked"),
    sc("escape", "Escape pencereyi kapatır, ızgara kalır", O, [wait(1500), key("Escape"), wait(400)]),
], part="Pencere ve önizleme")
extend("3.1", [
    sc("short-names", "Kısa ad eksik: \"Add location short names before exporting.\" + Open Location Settings", O, setup="schedule-short-name-missing"),
    sc("short-names-manager", "Kısa ad eksik, ayar yetkisi yok (müdür): \"Ask a workspace manager to add them.\"", M, setup="schedule-short-name-missing"),
    sc("preview-failed", "Önizleme hazırlanamadı: \"Could not prepare the preview\"", O, [wait(2500)], fail=[{"path": r"/export-v2/authorize$", "method": "POST", "status": 500}]),
    sc("export-failed", "İndirme hazırlanamadı: yetki doğrulanamadı (403)", O, [wait(2500), click(".export-v2-primary"), wait(1500)], fail=[{"path": r"/export-v2/authorize$", "method": "POST", "status": 403}]),
], part="Engeller ve hatalar")

# ---------------------------------------------------------------- 3.2 Schedule templates
# The address opens the New Schedule window at its Templates tab (the old page is gone).
TP_RO = BASE + ["schedule.read", "schedule.templates.read"]
RENAME_FORM = ".new-schedule-window-rename"
set_part("3.2", "Roller", ["owner", "manager"])
set_part("3.2", "Ad değiştirme · Rename", ["rename"])
set_part("3.2", "Silme · Delete", ["delete"])
replace("3.2", "manager", sc("manager", "Manager · Rachel Adams: yalnız tamamı Downtown'da olan şablonlar", M, part="Roller"))
replace("3.2", "rename", sc("rename", "⋯ → Rename: satırda ad kutusu (Standard week)", O, more("Standard week") + [click("Rename")], part="Ad değiştirme · Rename"))
replace("3.2", "delete", sc("delete", "⋯ → Delete: iki tık (\"Click again to delete\")", O, more("Standard week") + [click('[aria-label="Delete template Standard week"]')], part="Silme · Delete"))
extend("3.2", [
    sc("read-only", "Yalnız okuyabilen rol: liste görünür; Save template, Use ve ⋯ menüsü yok", C, perms=TP_RO),
    sc("phone", "Telefonda kapalı (sağdaki telefon çerçevesi)", O),
], part="Roller")
extend("3.2", [
    sc("loading", "Yükleniyor: şablon listesinin gri iskeleti", O, hold=[r"/schedule/templates$"]),
    sc("error", "Şablonlar okunamadı: We couldn't load templates + Try again (sunucu metni gösterilmez)", O, fail=[{"path": r"/schedule/templates$", "method": "GET", "status": 500}]),
    sc("empty", "Hiç şablon yok: \"No templates yet…\"", O, setup="schedule-no-templates"),
    sc("save-form", "Save template formu: taslak (Next week plan), şablon adı", O, SAVE_TEMPLATE_FORM, setup="schedule-draft-this-week"),
    sc("use-target", "Use: önce hangi schedule'a gireceği", O, [click("Use template Standard week"), wait(300)]),
], part="Sekme durumları")
extend("3.2", [
    sc("renamed", "Ad değişti: \"Template renamed\"", O, more("Standard week") + [click("Rename"), fill(f"{RENAME_FORM} input", "Standard week (fall)"), click("Save", within=RENAME_FORM), wait(1200)]),
    sc("rename-taken", "Var olan ad: \"The template could not be renamed. Try again.\" (API ad çakışmasını ayrı bildirmiyor)", O, more("Standard week") + [click("Rename"), fill(f"{RENAME_FORM} input", "Downtown open shifts"), click("Save", within=RENAME_FORM), wait(1200)]),
    sc("rename-changed", "Şablon başka yerde değişmiş: \"This template changed. Refresh and try again.\"", O, more("Standard week") + [click("Rename"), fill(f"{RENAME_FORM} input", "Standard week (fall)"), click("Save", within=RENAME_FORM), wait(1200)], setup="schedule-template-changed"),
], part="Ad değiştirme · Rename")
extend("3.2", [
    sc("deleted", "Silindi: \"Template deleted\", listeden düştü", O, more("Standard week") + [click('[aria-label="Delete template Standard week"]'), click(ARMED), wait(1500)]),
    sc("delete-failed", "Silinemedi: bildirim \"Template could not be deleted\" · \"The template could not be deleted.\"", O, more("Standard week") + [click('[aria-label="Delete template Standard week"]'), click(ARMED), wait(1500)], fail=[{"path": r"/schedule/templates/[0-9a-f-]+$", "method": "DELETE", "status": 500}]),
], part="Silme · Delete")

# ---------------------------------------------------------------- 3.3 Requests
def rid(n): return f"{n:08x}-0000-4000-8000-{n:012x}"
REQ = "/app/schedule/requests"
def req(n): return f"{REQ}?request={rid(n)}"
CONFIRM = ".app-confirm"
# The review drawer (a role=dialog panel); the app's sidebar is an <aside> too.
DRAWER = '.requests-review-drawer, .catalog-drawer[role="dialog"]'
TO_ONLY = BASE + ["schedule.read", "schedule.time_off_requests.read", "schedule.time_off_requests.manage"]
set_part("3.3", "Roller", ["owner", "manager"])
set_part("3.3", "Liste · sekmeler, süzgeç, arama", ["only-timeoff", "shift-changes"])
set_part("3.3", "İzin çekmecesi · Review request", ["timeoff", "timeoff-shifts", "deny"])
set_part("3.3", "Cover ve Open shift çekmecesi · Review shift change", ["cover", "open"])
set_part("3.3", "Takas penceresi · Swap request", ["swap"])
replace("3.3", "only-timeoff", sc("only-timeoff", "Time off sekmesi", O, [click("Time off", within='[aria-label="Request type"]')], part="Liste · sekmeler, süzgeç, arama"))
replace("3.3", "shift-changes", sc("shift-changes", "Shift changes sekmesi", O, [click("Shift changes", within='[aria-label="Request type"]')], part="Liste · sekmeler, süzgeç, arama"))
replace("3.3", "timeoff", sc("timeoff", "İzin çekmecesi · Details: Ethan Brooks (Also off these days dolu)", O, [click('[aria-label^="Ethan Brooks, Time off"]')], part="İzin çekmecesi · Review request"))
replace("3.3", "timeoff-shifts", sc("timeoff-shifts", "İzin çekmecesi · Shifts: açılacak vardiyalar", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Shifts", within=DRAWER)], part="İzin çekmecesi · Review request"))
extend("3.3", [
    sc("admin", "Admin · Daniel Brooks: bütün talepler", A),
    sc("single-type", "Yalnız izinleri okuyabilen rol: sekme yok, yalnız Time off", C, perms=TO_ONLY),
    sc("employee", "Employee Requests'e giremez: aynı adreste erişim kartı (You don't have access to Requests)", E),
    sc("phone", "Telefonda kart listesi ve kayan sekmeler (sağdaki telefon çerçevesi)", O),
], part="Roller")
extend("3.3", [
    sc("loading", "Yükleniyor: listenin gri iskeleti", O, hold=[r"/schedule/requests$"]),
    sc("error", "İzin talepleri okunamadı: listede çerçevesiz kart We couldn't load requests + Try again (Shift changes görünmeye devam eder)", O, fail=[{"path": r"/schedule/requests$", "method": "GET", "status": 500}]),
    sc("no-access", "Erişim yok kartı", M, fail=[{"path": r"/schedule/requests$", "method": "GET", "status": 403}]),
], part="Sayfa durumları")
extend("3.3", [
    sc("location", "Lokasyon süzgeci: yalnız Uptown", O, [wait(1200), fill('[aria-label="Filter by location"]', UT), wait(800)]),
    sc("search", "Arama: \"Maria\"", O, [fill('[aria-label="Search requests"]', "Maria"), wait(800)]),
    sc("search-empty", "Sonuç yok: \"No requests match these filters.\"", O, [fill('[aria-label="Search requests"]', "zzz"), wait(800)]),
    sc("tab-empty", "Sekmede sonuç yok: \"No shift change requests match these filters.\"", O, [click("Shift changes", within='[aria-label="Request type"]'), fill('[aria-label="Search requests"]', "zzz"), wait(800)]),
    sc("closed", "Kapanmış talepler listenin altında (Approved, Denied, Revoked)", O, [wait(1200), {"scroll": '[aria-label^="Priya Patel, Time off"]'}, wait(400)]),
    sc("pagination", "Sayfalama: 50'lik sayfa, 2. sayfa (54 talep)", O, [{"scroll": ".list-pagination, nav[aria-label*='agination']"}, wait(300), click("Next page"), wait(800)], setup="requests-many"),
], part="Liste · sekmeler, süzgeç, arama")
extend("3.3", [
    sc("timeoff-activity", "İzin çekmecesi · Activity", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Activity", within=DRAWER)]),
    sc("deep-link", "?request= bağlantısıyla doğrudan açılış (Emma Wilson)", O, path=req(0x707)),
    sc("open-in-schedule", "\"Open in Schedule\" bağlantısı (Schedule'a götürür)", O, [click('[aria-label^="Ethan Brooks, Time off"]'), act("hover", "Open in Schedule")]),
    sc("approve-dialog", "Owner tek başına onaylar: \"Approve time off?\" (açılacak vardiya sayısı)", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Approve", within=DRAWER), wait(400)]),
    sc("approved", "Onaylandı: \"Time off approved.\", talep listede kapandı", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Approve", within=DRAWER), wait(400), click("Approve", within=CONFIRM), wait(1500)]),
    sc("manager-vote", "Müdür oyu: \"Your approval is saved. 1 location still to approve.\", sonra View-only", M, path=req(0x708), steps=[click("Approve", within=DRAWER), wait(1500)]),
    sc("manager-final", "Son onay müdürde: \"Approve time off?\" penceresi (Jake Thompson)", M, path=req(0x706), steps=[click("Approve", within=DRAWER), wait(500)]),
    sc("deny-confirm", "Reddetme: iki tık (Confirm deny)", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Deny", within=DRAWER), fill("textarea", "We are short on bussers this week."), click("Deny request")]),
    sc("denied", "Reddedildi: \"Time off denied.\"", O, [click('[aria-label^="Ethan Brooks, Time off"]'), wait(800), click("Deny", within=DRAWER), wait(300), click("Deny request"), wait(200), click(ARMED), wait(1500)]),
    sc("deny-error", "Reddetme hatası: çekmecede hata satırı", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Deny", within=DRAWER), click("Deny request"), click(ARMED), wait(1200)], fail=[{"path": r"/verdict$", "method": "POST", "status": 400, "error": "This request can no longer be decided."}]),
    sc("changed", "Talep değişmiş: \"This request changed. Review it again.\"", O, [click('[aria-label^="Ethan Brooks, Time off"]'), click("Approve", within=DRAWER), wait(400), click("Approve", within=CONFIRM), wait(1200)], fail=[{"path": r"/verdict$", "method": "POST", "status": 409, "reason": "time_off.changed", "error": "The shifts this time off affects have changed. Review them again"}]),
    sc("cancellation", "İptal talebi: \"Cancellation\" (Jake Thompson), Decline / Approve", O, path=req(0x710)),
    sc("cancellation-approve", "İptali onaylama: \"Approve cancellation?\"", O, path=req(0x710), steps=[click("Approve", within=DRAWER), wait(500)]),
    sc("revoke", "Onaylı izni geri alma: \"Revoke time off?\" (Reason zorunlu)", O, path=req(0x70e), steps=[click("Revoke"), wait(400)]),
    sc("revoked", "Geri alındı: \"Time off revoked.\"", O, path=req(0x70e), steps=[click("Revoke"), wait(400), fill(f"{CONFIRM} textarea", "Wedding moved to next spring."), click("Revoke", within=CONFIRM), wait(1500)]),
    sc("shorten", "Shorten time off formu (Maria Lopez)", O, path=req(0x70e), steps=[click("Shorten time off"), wait(400)]),
    sc("shortened", "Kısaltıldı: \"Maria's time off is shorter…\"", O, path=req(0x70e), steps=[click("Shorten time off"), wait(400), click('[aria-label="Give back period 2"]'), click("Give back these hours"), wait(1500)]),
    sc("shorten-none", "Başlamış izin: \"No future approved hours remain.\"", O, path=req(0x70b), steps=[click("Shorten time off"), wait(400)]),
    sc("view-only", "Kapanmış talep, müdür: \"View-only access\"", M, path=req(0x70a)),
    sc("fallback", "Lokasyonun müdürü yok: \"No location manager can decide. An admin or owner decides.\"", O, path=req(0x707), setup="requests-no-uptown-manager"),
], part="İzin çekmecesi · Review request")
COVER = '[aria-label^="Jake Thompson, Cover"]'
extend("3.3", [
    sc("cover-give", "Adayı seç: \"Give shift to …\"", O, [click(COVER), wait(800), click(".rd-cand-pick input"), wait(600)]),
    sc("cover-given", "Vardiya verildi: toast", O, [click(COVER), wait(800), click(".rd-cand-pick input"), wait(800), click("Give shift to"), wait(1500)]),
    sc("cover-decline", "Adayı reddetme: gerekçe ve iki tık", O, [click(COVER), wait(800), click('[aria-label^="Decline "]', within=DRAWER), wait(300), fill(".rd-textarea", "We need someone with bar training."), click("Decline", within=".rd-foot-actions"), wait(300)]),
    sc("cover-close", "Talebi kapatma: gerekçe ve onay (Close request)", O, [click(COVER), wait(800), click("Close request"), wait(300), fill(".rd-textarea", "Jake found a ride after all."), click("Close request", within=".rd-foot-actions"), wait(300)]),
    sc("cover-none", "Aday yok: \"Nobody has asked yet…\", \"Nobody to approve\"", O, [click('[aria-label^="Open shift, Open shift"]'), wait(800)]),
    sc("cover-closed", "Kapanmış cover/open: \"Approved. The shift is … now.\"", O, [wait(1200), {"scroll": 'tr[aria-label^="Open shift"]:has([data-tone="green"])'}, click('[aria-label^="Open shift"]:has([data-tone="green"])'), wait(800)]),
    sc("cover-check-failed", "Uygunluk denetlenemedi: \"Eligibility could not be checked…\"", O, [click(COVER), wait(800), click(".rd-cand-pick input"), wait(800)], setup="requests-preview-fails"),
    sc("cover-manager", "Müdür: kendi lokasyonundaki cover'ı tek başına verir (Give shift to Jake)", M, [click('[aria-label^="Maria Lopez, Cover"]'), wait(800), click(".rd-cand-pick input"), wait(800)]),
], part="Cover ve Open shift çekmecesi · Review shift change")
SWAP = '[aria-label^="Jake Thompson, Swap"]'
extend("3.3", [
    sc("swap-approved", "Takas onaylandı: \"Swap approved.\"", O, [click(SWAP), wait(1200), click("Approve", within='dialog.swap-review'), wait(1500)]),
    sc("swap-decline", "Takas reddi: gerekçe ve iki tık \"Decline swap\"", O, [click(SWAP), wait(1000), click("Decline", within='dialog.swap-review'), fill('dialog.swap-review textarea', "Sophie is already at 38 hours this week."), click("Decline swap"), wait(200)]),
    sc("swap-blocked", "Takas engeli: Sophie Martin o gün izinli, Approve pasif", O, [click(SWAP), wait(1500)], setup="requests-swap-time-off"),
    sc("swap-other-manager", "Müdür: \"Another location's manager also approves.\" (Uptown henüz onaylamadı)", M, [click(SWAP), wait(1500)], setup="requests-swap-unvoted"),
    sc("swap-manager", "Müdür: Uptown onayladı, son karar Rachel'da (Approve etkin)", M, [click(SWAP), wait(1500)]),
    sc("case-link", "?case= bağlantısıyla doğrudan açılış (bildirimden; Maria Lopez'in cover talebi)", O, path=f"{REQ}?case={eid(0x7c1)}", steps=[wait(800)]),
    sc("case-missing", "Bulunamayan ?case=: müdürün eski Shift Hub görünümü", O, path=f"{REQ}?case=00000000-0000-4000-8000-000000000000"),
], part="Takas penceresi · Swap request")

# A two-click button disarms 3.2 s after its first click (useConfirmClick). The
# checker takes its picture 2500 + 900 × steps ms after loading, so a scenario
# that ends on an armed button waits first: the arming click lands about 2 s
# before the picture (the app takes about 3 s to start in the atlas).
def _arm_late(no, ids, extra=0):
    # ids: a set, or {id: extra ms} where that scenario's steps run faster than counted.
    for one in page(no)["scenarios"]:
        if one["id"] not in ids: continue
        more = extra + (ids[one["id"]] if isinstance(ids, dict) else 0)
        steps = one["steps"]
        last = len(steps) - 1
        while last > 0 and "wait" in steps[last]: last -= 1
        before, after = steps[:last], steps[last:]
        ms = 600 + sum(s.get("wait", 0) for s in before) + 200 * sum(1 for s in before if "wait" not in s)
        total = 2500 + 900 * (len(steps) + 1)
        pad = max(0, total - 2900 + more - ms - sum(s.get("wait", 0) for s in after))
        one["steps"] = before + [wait(pad)] + after
# Leaving edit mode with unsaved work asks first (cab698f5, KK-164): the side
# menu, Back/Forward, the workspace switcher and Sign out all go through it.
LEAVE_PART = "Ayrılma uyarısı · Save changes before leaving?"
LEAVE_EDIT = LIVE + [act("dblclick", card("carlos", 1)), wait(600), fill('textarea', "Cover the pass"), click("Save", within='[role="dialog"]'), wait(1200)]
EMP_LINK = '[aria-label="Application sidebar"] a[href="/app/employees"]'
LEAVE_Q = '[role="alertdialog"]'
extend("3.0", [
    sc("leave-ask", "Kaydedilmemiş düzenlemeyle sol menüden Employees: \"Save changes before leaving?\" (Keep editing / Discard and leave / Save draft)", O, LEAVE_EDIT + [click(EMP_LINK), wait(500)]),
    sc("leave-keep", "Keep editing: soru kapanır, Schedule'da ve düzenlemede kalır", O, LEAVE_EDIT + [click(EMP_LINK), wait(500), click("Keep editing", within=LEAVE_Q), wait(400)]),
    sc("leave-discard", "Discard and leave: değişiklik atılır ve sayfadan çıkılır (PAGES burada Employees sayfasının numarasını söyler)", O, LEAVE_EDIT + [click(EMP_LINK), wait(500), click("Discard and leave", within=LEAVE_Q), wait(1500)]),
    sc("leave-save", "Save draft: önce taslak adı penceresi; kaydedince sayfadan çıkılır", O, LEAVE_EDIT + [click(EMP_LINK), wait(500), click("Save draft", within=LEAVE_Q), wait(600)]),
    sc("leave-clean", "Değişiklik yokken çıkış sormaz (PAGES doğrudan Employees sayfasının numarasını söyler)", O, LIVE + [click(EMP_LINK), wait(1500)]),
], part=LEAVE_PART)

_arm_late("3.0", {"draft-delete": 400, "editor-delete": 200, "save-overwrite": 0, "save-before-export-overwrite": 0, "save-failed-discard": 0, "unpublish-confirm": 400, "templates-replace": 1100})
_arm_late("3.2", {"delete"}, extra=1000)
_arm_late("3.3", {"deny-confirm", "cover-decline", "cover-close", "swap-decline"}, extra=500)
