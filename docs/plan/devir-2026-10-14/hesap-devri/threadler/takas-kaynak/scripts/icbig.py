p = "/mnt/project-files/pages/gorsel-kararlar/gelen/vardiya-degisim/index.html"
s = open(p, encoding="utf-8").read()
def rep(x, y, n=1):
    global s
    assert s.count(x) == n, (x[:70], s.count(x))
    s = s.replace(x, y)
rep('<td class="ic">${kindIcon(r, 28)}', '<td class="ic">${kindIcon(r, 40)}')
rep('table.list th.ic, table.list td.ic { width: 52px; padding-right: 0; }', 'table.list th.ic, table.list td.ic { width: 54px; padding-right: 0; }')
# One size for the type tile on desktop and phone (Mert 00:54Z: too small in the table).
rep('.ki.s40 { width: 40px; height: 40px; border-radius: 10px; }', '.ki.s40 { width: 40px; height: 40px; border-radius: 10px; }\n.ki.s40 svg { width: 22px; height: 22px; }')
rep('table.list.rq td.ic { padding-top: 10px; }', 'table.list.rq td.ic { padding-top: 11px; }')
rep('table.list.rq td:nth-child(3) { padding-top: 11px; }', 'table.list.rq td:nth-child(3) { padding-top: 14px; }\ntable.list.rq td:nth-child(4) { padding-top: 15px; }\ntable.list.rq td:nth-child(2) { padding-top: 13px; }')
open(p, "w", encoding="utf-8").write(s)
print("ok")
