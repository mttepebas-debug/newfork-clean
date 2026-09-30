"""Backlog count and program-group check for the record session (KARARLAR OPS-04).

Run from the repo root:  python backlog_sayim.py
Reads docs/plan/BACKLOG.md and docs/plan/tasks/BACKLOG-PROGRAM.md; writes nothing.
"""
import collections
import io
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
BACKLOG = "docs/plan/BACKLOG.md"
PROGRAM = "docs/plan/tasks/BACKLOG-PROGRAM.md"
MARK = re.compile(r"\(leave: (\w+) / do: (\w+)\)")


def entries(lines):
    """Top-level '- ' lines, split at the closed-entries heading."""
    split = next(i for i, l in enumerate(lines) if l.startswith("## Kapanan maddeler"))
    out = ([], [])
    for i, l in enumerate(lines):
        if l.startswith("- "):
            m = re.match(r"^- \*{0,2}(BL-\d+)", l)
            out[0 if i < split else 1].append((i + 1, m.group(1) if m else None, l))
    return out


def strip_parens(s):
    # Parenthesised ids in the group table are closed entries; nesting happens.
    out, depth = [], 0
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            out.append(ch)
    return "".join(out)


def norm(text):
    text = re.sub(r"^\(leave:[^)]*\)\s*", "", text)
    return re.sub(r"[^0-9a-zçğıöşü]", "", text.lower())[:28]


bl = open(BACKLOG, encoding="utf-8").read().split("\n")
pg = open(PROGRAM, encoding="utf-8").read().split("\n")
op, cl = entries(bl)
numbered = lambda es: sum(1 for e in es if e[1])

print("açık %d (numaralı %d, numarasız %d)" % (len(op), numbered(op), len(op) - numbered(op)))
print("kapanan %d (numaralı %d, numarasız %d)" % (len(cl), numbered(cl), len(cl) - numbered(cl)))

ids_open = collections.Counter(e[1] for e in op if e[1])
ids_closed = collections.Counter(e[1] for e in cl if e[1])
nums = {int(k[3:]) for k in list(ids_open) + list(ids_closed)}
print("en yüksek BL-%d; satırı olmayan numara %d" % (max(nums), max(nums) - len(nums)))
print("kopya numara:", {k: v for k, v in (ids_open + ids_closed).items() if v > 1} or "yok")

leave, do, unmarked = collections.Counter(), collections.Counter(), []
for line_no, key, text in op:
    m = MARK.search(text[:200])
    if m:
        leave[m.group(1)] += 1
        do[m.group(2)] += 1
    else:
        unmarked.append((line_no, key, text[:70]))
print("leave", dict(leave), "| do", dict(do), "| işaretsiz", len(unmarked))
for u in unmarked:
    print("   işaretsiz:", u)

# Program groups: table rows, the GF/GY/GS lines, and GK (only BL-073 waits there).
groups = collections.OrderedDict()
start = next(i for i, l in enumerate(pg) if l.startswith("| Sıra | Grup"))
for l in pg[start + 2:]:
    if not l.startswith("|"):
        break
    cols = l.split(" | ")
    groups[cols[1].strip("* ")] = re.findall(r"\bBL-\d+\b|\bU\d\d\b", strip_parens(cols[3]))
for l in pg:
    m = re.match(r"^- \*\*(GF|GY|GS) ", l)
    if m:
        groups[m.group(1)] = re.findall(r"\bBL-\d+\b|\bU\d\d\b", strip_parens(l))
groups["GK"] = ["BL-073"]

alias = {}
for l in pg:
    m = re.match(r"^\| (U\d\d) \| (\d+) \| ([^|]+) \| (.*) \|$", l)
    if m:
        alias[m.group(1)] = m.group(4)
open_u = set()
for line_no, key, text in op:
    if key is None:
        hit = [u for u, t in alias.items() if norm(t) == norm(text[2:].replace("**", ""))]
        if len(hit) != 1:
            print("   takma adı bulunamayan numarasız madde:", line_no, text[:70])
        open_u.update(hit)

open_all = set(ids_open) | open_u
where = collections.defaultdict(list)
for g, ids in groups.items():
    for i in ids:
        where[i].append(g)
stale = {g: [i for i in ids if i not in open_all] for g, ids in groups.items() if g != "G0"}
print("grupta ama açık değil:", {g: v for g, v in stale.items() if v} or "yok")
print("iki grupta:", {k: v for k, v in where.items() if len(v) > 1 and set(v) != {"G0"}} or "yok")
print("açık ama grupsuz:", sorted(open_all - set(where)) or "yok", "(BL-426 bilerek grupsuz)")
print("grup başına açık:", {g: len([i for i in set(ids) if i in open_all]) for g, ids in groups.items() if any(i in open_all for i in ids)})
