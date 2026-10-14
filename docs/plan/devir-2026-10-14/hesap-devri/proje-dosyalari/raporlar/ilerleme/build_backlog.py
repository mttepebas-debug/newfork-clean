#!/usr/bin/env python3
"""Builds backlog.html (the backlog page of the progress report) from BACKLOG.md.

Usage: python3 build_backlog.py <BACKLOG.md> <out.html> <source label>
Example: git show origin/main:docs/plan/BACKLOG.md > /tmp/bl.md
         python3 build_backlog.py /tmp/bl.md backlog.html "main 021f82e"
"""
import html, json, re, sys
from datetime import datetime, timezone

src, out, label = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(src, encoding="utf-8").read().split("\n")

items, cur, sec = [], None, ""
for l in lines:
    if l.startswith("## "):
        sec = l[3:].strip()
        cur = None
        continue
    m = re.match(r"^- (\*\*|~~)?\s*(~~)?\s*\**(BL-(\d+))", l)
    if m:
        cur = {"id": m.group(3), "n": int(m.group(4)), "head": l, "body": [], "sec": sec}
        items.append(cur)
    elif cur and l.startswith("  "):
        cur["body"].append(l)

CLOSED = re.compile(r"\*\*Kapand[ıi]|Kapand[ıi] 20|KAPANDI|kapandı \(|— kapandı|\*\*Kapanış|\(kapandı")
AREAS = [
    ("Schedule", r"schedule|şablon|template|ızgara|publish|yayın|export|bu hafta|haftayı"),
    ("Giriş ve katılım", r"sign[- ]in|giriş ekran|girişte|katılım|davet|invitation|onboarding|parola|password|hesap kurtarma|create your workspace"),
    ("Requests", r"requests|shift changes|takas|cover|swap|time off|izin|exchange|shift hub"),
    ("Employees", r"employees|işten çıkar|terminat|çalışan çekmece|employee drawer|archive"),
    ("Availability", r"availability|müsait"),
    ("Documents", r"document|belge"),
    ("Announcements", r"announcement|duyuru"),
    ("Important Dates", r"important dates|kapalı gün|closed day|önemli tarih"),
    ("Bildirim", r"notification|bildirim|e-posta|email|resend"),
    ("Settings", r"settings|roles & permissions|jobs|locations|general"),
    ("Workspace", r"workspace|todos|checklist"),
    ("Account", r"account|profile|preferences"),
    ("Çalışan ekranları", r"employee view|employee hub|çalışan görünüm|telefon"),
    ("Billing", r"billing|stripe|ödeme"),
    ("Yetki ve güvenlik", r"yetki|rls|grant|authz|authorize|güvenlik|security|_service"),
    ("Test, CI ve araçlar", r"\bci\b|e2e|pgtap|test|guard|tren|train|lock|kilit|script|betik|vitest|playwright"),
]

SCREENS = ["Schedule", "Requests", "Employees", "Availability", "Workspace", "Documents",
           "Announcements", "Important Dates", "Settings"]

def area(title, desc, sec):
    s = sec.lower()
    for name in SCREENS:
        if name.lower() + " ekranı" in s or name.lower() + " çekmece" in s or "→ " + name.lower() in s:
            return name
    if "giriş ve katılım" in s or "giriş ve onboarding" in s:
        return "Giriş ve katılım"
    if "bildirim" in s:
        return "Bildirim"
    best, score = "Diğer", 0
    for name, rx in AREAS:
        n = 3 * len(re.findall(rx, title.lower())) + len(re.findall(rx, desc.lower()))
        if n > score:
            best, score = name, n
    return best

def clean(s):
    s = re.sub(r"`([^`]*)`", r"\1", s)
    s = s.replace("**", "").replace("~~", "")
    return re.sub(r"\s+", " ", s).strip()

rows = []
for i in items:
    h, b = i["head"], "\n".join(i["body"])
    closed = bool(i["sec"].startswith("Kapanan") or h.startswith("- ~~") or h.startswith("- **~~") or CLOSED.search(h + b))
    lv = re.search(r"leave:\s*([^/ )]+)", h)
    do = re.search(r"do:\s*([^) ]+)", h)
    bold = re.search(r"\*\*(.+?)\*\*", h)
    title = clean(bold.group(1)) if bold else clean(h[2:])
    title = re.sub(r"^BL-\d+\s*(\([^)]*\))?\s*", "", title)
    rest = clean(h[bold.end():]) if bold else ""
    stale = bool(re.search(r"Tazelik[^\n]*: bayat", b))
    rows.append({
        "id": i["id"], "n": i["n"],
        "t": title[:260], "d": rest[:320],
        "imp": (lv.group(1).lower() if lv else "belirsiz"),
        "risk": (do.group(1).lower() if do else "belirsiz"),
        "area": area(title, rest, i["sec"]),
        "closed": closed, "stale": stale,
    })

stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
page = open(__file__.replace("build_backlog.py", "backlog.template.html"), encoding="utf-8").read()
page = page.replace("__DATA__", json.dumps(rows, ensure_ascii=False).replace("</", "<\\/"))
page = page.replace("__SOURCE__", html.escape(f"{label} · {stamp}"))
open(out, "w", encoding="utf-8").write(page)
o = [r for r in rows if not r["closed"]]
print(f"{len(rows)} items, {len(o)} open, {len(rows)-len(o)} closed -> {out}")
