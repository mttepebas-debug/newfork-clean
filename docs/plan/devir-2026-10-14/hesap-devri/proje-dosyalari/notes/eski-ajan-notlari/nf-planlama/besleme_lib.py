"""Edit helpers for the record session's feed scripts (KARARLAR OPS-04).

Every edit asserts its anchor is found exactly once; nothing is written until save_all().
Run feed scripts from the repo root; paths are relative to it.
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DOCS = {}


class Doc:
    def __init__(self, path):
        self.path = path
        raw = open(path, encoding="utf-8", newline="").read()
        self.eol = "\r\n" if "\r\n" in raw else "\n"
        self.lines = raw.replace("\r\n", "\n").split("\n")
        DOCS[path] = self

    def _find(self, prefix):
        hits = [i for i, l in enumerate(self.lines) if l.startswith(prefix)]
        assert len(hits) == 1, "%s: %d lines start with %r" % (self.path, len(hits), prefix[:70])
        return hits[0]

    def once(self, old, new):
        """Replace a single-line text that occurs exactly once in the file."""
        total = sum(l.count(old) for l in self.lines)
        assert total == 1, "%s: %d hits for %r" % (self.path, total, old[:70])
        i = next(i for i, l in enumerate(self.lines) if old in l)
        self.lines[i] = self.lines[i].replace(old, new)

    def set_line(self, prefix, new):
        self.lines[self._find(prefix)] = new

    def edit_line(self, prefix, fn):
        i = self._find(prefix)
        self.lines[i] = fn(self.lines[i])

    def after_line(self, prefix, *new):
        i = self._find(prefix)
        self.lines[i + 1:i + 1] = list(new)

    def before_line(self, prefix, *new):
        i = self._find(prefix)
        self.lines[i:i] = list(new)

    def append_sub(self, prefix, *subs):
        """Append sub-lines at the end of a top-level entry's indented block."""
        j = self._find(prefix) + 1
        while j < len(self.lines) and self.lines[j].startswith("  "):
            j += 1
        self.lines[j:j] = list(subs)

    def append_end(self, *new):
        """Append lines at the end of the file, keeping the final newline."""
        tail = len(self.lines)
        while tail and self.lines[tail - 1] == "":
            tail -= 1
        self.lines[tail:tail] = list(new)

    def close_entry(self, prefix, closed_sub):
        """BACKLOG: mark a top-level entry closed, add the closing sub-line, move its block to the end."""
        i = self._find(prefix)
        j = i + 1
        while j < len(self.lines) and self.lines[j].startswith("  "):
            j += 1
        block = self.lines[i:j]
        assert "(leave: " in block[0][:60], self.path + ": no open mark in " + prefix
        head, rest = block[0].split("(leave: ", 1)
        marks, rest = rest.split(")", 1)
        leave, do = marks.split(" / do: ")
        block[0] = "%s(kapandı; açıkken işaretleri %s / %s)%s" % (head, leave, do, rest)
        del self.lines[i:j]
        self.append_end(*block, closed_sub)
        return leave, do

    def replace_block(self, prefix, *new):
        """Replace a top-level line and its indented continuation lines (no new lines = delete)."""
        i = self._find(prefix)
        j = i + 1
        while j < len(self.lines) and self.lines[j].startswith("  "):
            j += 1
        self.lines[i:j] = list(new)

    def append_last_cell(self, prefix, extra):
        i, cols = self._cells(prefix)
        assert cols[-1].endswith(" |"), self.path + ": row does not end with ' |'"
        cols[-1] = cols[-1][:-2] + extra + " |"
        self.lines[i] = " | ".join(cols)

    def _cells(self, prefix):
        i = self._find(prefix)
        return i, self.lines[i].split(" | ")

    def set_cell(self, prefix, idx, value):
        """Set one cell of a table row; idx -1 is the last cell (keeps the closing ' |')."""
        i, cols = self._cells(prefix)
        if idx in (-1, len(cols) - 1):
            assert cols[-1].endswith(" |"), self.path + ": row does not end with ' |'"
            cols[-1] = value + " |"
        else:
            cols[idx] = value
        self.lines[i] = " | ".join(cols)

    def add_to_cell(self, prefix, idx, extra):
        i, cols = self._cells(prefix)
        cols[idx] = cols[idx] + extra
        self.lines[i] = " | ".join(cols)


def save_all():
    for d in DOCS.values():
        open(d.path, "w", encoding="utf-8", newline="").write(d.eol.join(d.lines))
    print("yazıldı:", ", ".join(DOCS))
