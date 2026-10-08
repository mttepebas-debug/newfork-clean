# Dersler

Kural: `CLAUDE.md` §4.6. Ders yalnız gerçek bir olayda yazılır; aynı ders ikinci kez yeni giriş olmaz, eski girişe tarih ve bu seferki maliyet eklenir; üçüncü kez görülen ders `CLAUDE.md`'ye kural önerisi olarak Mert'e gider. Bu dosya her oturuma yüklenmez; koordinatör ve haftalık denetim okur, koordinatör yazar.

2026-10-07'de `~/.claude/OBSERVATIONS.md`'den aynen taşındı (yedek: masaüstü `OBSERVATIONS-yedek-2026-10-06.md`). Girişlerin çoğu artık kural; haftalık denetim ayıklar.

---

# Observations

How this particular working relationship goes well, and how it goes wrong.
Each entry comes from something that actually happened, with what it cost and
the habit that would prevent it. General advice does not belong here; if an
entry could have been written before the day started, it is not an entry.

Written after a task, by me. Sent to the user every fifth entry, because half
of what is here is about how a request is best given, and that half only works
if they see it too.

---

## 1. The list arrives in pieces, and "start" arrives before the list ends

**What happened.** 2026-09-22, building the local fixture. The specification
came in five messages spread across an hour: the shape first, then Dinner's
hours changed, then one address moved from invitation to employee, then
another address was added as a suspended employee, then every password became
the same. Each was a sentence to write and a quarter of an hour to apply,
because the fixture had to be regenerated and re-verified each time.

**What it cost.** Three full regenerations and two verification passes. The
final result was no different from what one complete list would have produced.

**The habit.** Mine: read the whole list back before starting, and treat
anything added afterwards as a scope change rather than a detail -- say what
it now costs, then apply it. Theirs, if it helps: write the list to the end
once before saying start. Thinking of the fourth item while the first is being
built is what makes it expensive.

**Seen from the other side, 2026-09-22 (AVAIL-001).** The brief arrived whole:
the rules marked closed to discussion, the scope and its exclusions, done
criteria, measured context, even the model. One question round settled the
three gaps it left (manager reminder weeks, two texts that would turn false,
23:59 against the editor's 24:00), and nothing was rebuilt afterwards. The
habit holds; a complete list costs one round, not five.

---

## 2. "Continue" is a broad yes, and it was read as an unlimited one

**What happened.** Same day. After a long stretch of test archaeology I asked
whether to keep going. The answer was "Devam". I read it as permission to work
through thirty-four files; what was meant was a short continuation. Several
hours later came "why are we wasting time on this".

**What it cost.** Most of an afternoon spent on work that was not wanted, and
a conversation that had to be reset.

**The habit.** Never resume on a bare yes. Restate the scope in the same
breath: "continue = these three files, then I stop". A one-line restatement
costs nothing and would have caught this within seconds.

---

## 3. The difference between a small job and a deep dig is never stated

**What happened.** The request was: after a database reset, fill the workspace
back up the easy way, so nothing has to be typed in by hand. I delivered that
-- and then kept going: a broken seed, a test suite, thirty-seven aborting
files, a product-rule question. All of it real, none of it asked for.

**What it cost.** Hours of work that landed in the backlog rather than in the
product, and the feeling of a simple request being turned into a project.

**The habit.** Mine: when a request is phrased in terms of an outcome the user
wants for themselves -- "so I do not have to do it by hand" -- it is a small
job, and it ends when that outcome is reached. Theirs: one word at the front,
"this is a small job" or "go all the way down on this", is worth more than any
amount of clarification afterwards.

---

## 4. Numbers were supplied where meaning was asked for

**What happened.** Repeatedly through the day I reported test counts -- 3206
measured, 59 red, 37 aborting -- when what had been asked was what is broken
and what it means. The counts were accurate and almost none of them changed a
decision. The questions that were actually asked were of the form "explain it
to me in human language, with examples".

**What it cost.** Long messages that had to be read twice to find the one
sentence that mattered.

**The habit.** A number earns its place by deciding something. Otherwise say
what changed and what it means in use. This user asks for proof, which is not
the same as asking for metrics: the proof they want is "here is the thing
working", not "here is the count".

**Again, 2026-09-24 (coordinator, CI cost).** I gave the CI cost in minutes
("~16 billed minutes a run, 7,000–11,000 a month") and sent BL-103 off to shave
minutes on GitHub's machine. The user dismissed my next question and asked for
the dollar figure; at ~$25–60 a month they moved CI to their own PC, which made
BL-103 moot. Cost: a worker started and was stopped mid-task, one extra question
round. Habit: a recurring cost goes out in money in the first message, next to
whatever unit it was measured in; the decision is made in the unit the user pays.

---

## 5. Pushback on a fact usually means one word is covering two things

**What happened.** I reported that a shift type cannot be created without
hours. The answer was that it can -- "the app lets you write a shift without
hours". Both statements were true. A *shift* without typed hours is allowed,
because the hours come from its type; a *shift type* without hours is refused
by the database. One Turkish phrase was covering two different objects.

Earlier the same day the same shape appeared around what to call a workspace:
the word had a history in this project and carried a decision with it.

**What it cost.** A round trip and a measurement to establish that nobody was
wrong.

**The habit.** When the user contradicts something I measured, check the
vocabulary before checking the fact. Ask which of the two things is meant, or
show both with their separate answers, rather than defending the measurement.
The disagreement is usually about naming, and naming is theirs to set.

---

## 6. A shared fixture was deleted on a partial count of who used it

**What happened.** 2026-09-22. The seed's demo week stopped loading, and I took
it out, telling the user the tests that leaned on it should build their own.
I had counted nine suites that named its rows. Hours later, sweeping BL-070,
seven of the suites still dying turned out to depend on exactly those rows --
and I put the week back, rewritten to load, reversing what I had told the user
that afternoon.

**What it cost.** A reversal the user has to review, two rounds of seed work
where one would have done, and a decision taken on their behalf twice.

**The habit.** Before deleting anything shared -- a fixture, a helper, a
table others read -- measure every dependent by running them, not by
searching for its ids. A grep finds who names a thing; only a run finds who
needs it. And when a deletion turns out wrong, say so as a reversal, in the
same place the first decision was reported.

**Again, 2026-09-22 (BTN-001).** I told the user twelve buttons were green by
mistake; the number came from a one-line grep, and the real count, read from
whole elements, was thirty-four. The same task's first "after" screenshots
then caught what no grep would have: moving one CSS rule turned the text of
five red buttons dark red on red. Cost: a correction mid-task and one extra
round of screenshots. A count that decides scope is taken from the rendered
page or a parser, not from a line search.

---

## 7. The same failure gets written down twice, with two different fixes

**What happened.** 2026-09-22 I recorded a flaky Schedule > Publish test as
BL-089, with its cause: the test answered the preview once, the dialog asked
twice. A day later another session met the same failure on CI and wrote a new,
unnumbered entry beside it, blaming a timeout and suggesting a guard in the
product code. On 2026-09-24 the user asked whether any of my findings had been
picked up, and the answer had to start by untangling the two.

**What it cost.** A merge of two entries, and a near miss: the second entry's
fix would have taught the product to tolerate something only the test
produces.

**The habit.** Before writing a backlog entry about a failing test, search the
backlog for the test's name. If it is there, add the new sighting to that
entry instead of opening a second one. The dates of sightings are the useful
part; a second diagnosis next to the first is noise.

---

## 8. A timing taken on the shared database measured the other sessions

**What happened.** 2026-09-24, BL-102. The first "after" timings of the slow
pgTAP files ran while another session was testing on the same local database.
I told the user one file had barely improved, 12 s to 11 s. A profile then
showed its functions finishing in under a second: the rest was waiting for the
other session's transaction, because every test creates the pgtap extension
and a second creator queues behind the first. Timed properly, the file went
from 12 s to 0.6 s.

**What it cost.** A wrong number in a status line, and about fifteen minutes
chasing a slowness that did not exist.

**The habit.** On the shared local database, a timing is not reported until
`pg_stat_activity` has been checked for other clients, anything that can queue
(pgtap creation) happens before the clock starts, and "before" and "after" run
back to back. A number taken under contention is either retaken or said to be
noisy. CI, on its own fresh database, is the clean comparison.

**Again, 2026-09-25 (FOUNDATION-B 5.5e).** The full web test run went in
parallel with the 92-file pgTAP list to save time. It took 171 s instead of
~80 s and nine tests in five files timed out; alone, all of them passed. It
cost one misleading red and a rerun. A run whose result decides a push does
not share the machine with another heavy run.

**Again, 2026-09-28 (koordinatör, gece birleştirme kuyruğu).** While main CI's
e2e ran on the same PC (runner 2), I ran the full web gate and two timing
comparisons of App.test. CI's `owner-legal-name-setup` timed out and main went
red for one rerun (~5 min); locally App.test also failed twice under the
parallel turbo gate. Cost: a red main, a rerun, and a false lead on BL-192.
The rule is already in the project file ("aynı anda en çok iki ağır iş"); what
was missing is treating a running CI job as one of the two. Habit: before any
heavy local run, `gh run list --branch main --limit 1`; if it is in progress,
wait for it.

**Again, 2026-09-29 (koordinatör, BL-218.3 merge).** Right after pushing
`be46cd22`, main CI's e2e ran while I had a local Schedule e2e, a visual-QA
agent's two dev servers, and the user's fresh PR CI all on the same PC. CI's
`schedule-shift-note` hit the 60 s limit (10 s normally). I then compared
timings taken under that same load and told the user BL-218.3 caused the
slowdown; an idle full run (16.6 s, control 15.8 s) and a plain rerun (green)
showed it was load. Cost: a red main for ~25 min, ~30 min of chasing, and a
wrong verdict said to the user. Fourth time: the habit above was known and
still skipped because the push felt "done". Proposed to the user as a
project CLAUDE.md rule (a running CI job counts as one of the two heavy jobs).

**Again, 2026-09-29 evening (new coordinator, local_54c1c741).** With four
worker sessions running local tests beside CI on the same PC, three reds came
from load, none from code: `schedule_grid_read_budget` twice on G9b branches
(50.7 and 65 ms, min-of-runs) and the G5 recovery-resend wall-clock test on
main (1638 ms against a 400 ms bound). The rule held this time (static proof
that the grid path never touches G9b; rerun of only the failed job, green), so
no wrong verdict reached the user. Cost: two reruns (~10 min) and one red main
for ~15 min. What was new: the load came from my own parallelism, not from one
careless run. Habit added: a test that measures wall-clock time is a load
sensor, not a check; turn it into a fake-clock or best-of-N check when it first
flakes (done for both), and keep the number of workers running heavy local
tests at two while CI is busy.

---

## 9. A restart test knocked over what was hanging off the thing restarted

**What happened.** 2026-09-24, BL-107. To prove the new CI runner comes back
at boot, I stopped WSL's Ubuntu twice with `wsl --terminate` (having rightly
ruled out `--shutdown`, which would stop Docker and the shared database).
Docker Desktop's link into Ubuntu did not survive it: `docker` vanished inside
Ubuntu, a Docker error dialog appeared on the user's screen, and its Restart
button could not fix it. The user had to restart Docker Desktop, which took the
shared database down for two minutes for every session.

**What it cost.** An error the user had to read and act on twice, a short
outage for the other sessions, and a round of diagnosis.

**The habit.** Before restarting any piece of the machine to prove something,
list what else hangs off it (Docker integration, other runners, other
sessions' services) and say it in the same breath as the plan. If the proof
needs a restart of shared infrastructure, ask first, or prove it another way:
here, reading the service's enabled state and the existing logon task would
have been enough.

---

## 10. A question asked before building moved a day-old product rule

**What happened.** 2026-09-24, FOUNDATION-B 5.3. The stage-0 decision of
2026-09-23 said availability has two options (Soft / Hard). Before writing the
new grid read, the research turned up one thing the build depended on: under
Hard, does the manager's private reminder block too? I asked it as a
one-click question with a concrete case (Ayşe notes "Ali: not Mondays"; Ali
never sees it). The answer changed the rule itself: three levels (Warn / Soft
/ Hard) and the reminder always Soft.

**What it cost.** Nothing in code: no line had been written against the old
rule. One question round, and the decision rewritten in the plan, the program
log and the product rules the same hour.

**The habit.** When a slice is about to build on a product rule, even one
agreed the day before, name the one question the build turns on and ask it
before the first line, with a real example. A rule that looks settled can
still move; finding out before building is free, after building it is a
rebuild.

---

## 11. The seed changed, the shared database did not, and CI found it

**What happened.** 2026-09-24, FOUNDATION-B 5.3c. The seed's "Alex Kim cannot
work Fridays" example moved from a dated version to a weekly mark, which has no
end date. Locally every test was green, because the shared database had been
seeded long before and never saw the new mark. CI builds its database from the
seed, so its `db` job failed on `shift_exchanges_v1`, whose Friday shift for
Alex now needed a manager's acceptance. While reproducing it, one local run
reported 92 files and 117 checks with nothing red: the list file had Windows
line endings and the runner had opened almost none of the files.

**What it cost.** One red main CI run, a follow-up commit, and about twenty
minutes. The broken run cost nothing, because 117 checks in 92 files was too
tidy to believe.

**The habit.** When a change touches `seed.sql`, put the changed seed rows into
the shared database, or into the trial transaction, before a local green
counts. The CI `db` job is the only place the seed is built from scratch. The
test runner also has to fail loudly on a file it cannot open.

---

## 12. Two sessions took the same backlog number

**What happened.** 2026-09-25, FOUNDATION-B 5.5e. I wrote a new backlog item
as BL-117 in a worktree cut from main hours earlier. Meanwhile another session
had pushed BL-117, BL-118 and BL-119 to main. The rebase merged cleanly because
the lines were in different groups, so main briefly carried two BL-117 items.

**What it cost.** One renumbering commit, caught only because I grepped the
number after the rebase.

**The habit.** A new BL number comes from `origin/main` right before the commit
(fetch, then take the highest number + 1), not from the worktree's copy. After a
rebase that touched BACKLOG.md, grep the new number once.

**Again 2026-09-28.** Schedule draft/publish review, 15 items BL-296..BL-310.
The numbers were taken from a fresh `origin/main` right before the commit, as
above, but the commit went to the coordinator to push, and BL-199's closing
took BL-296..298 in between. Cost: the coordinator refused it, one rebase and
a +3 renumbering round. The habit above is not enough when someone else
pushes: a number is only held once it is on main, so whoever pushes re-checks
the highest number at push time, and a handed-off commit says "renumber if
taken" up front.

---

## 13. A new tool was set up at full size, then dropped the same night

**What happened.** 2026-09-25. The user moved the project from one coordinator
session to Agent Teams AI: first three teams of six, then one team of fifteen.
Within hours the PC froze, members disconnected and received the same message
over and over, the app's bundled Claude Code (2.1.251) could not run Opus 5.5,
and setup mistakes went unnoticed (a team in the wrong folder, a default team
name, ten members with broken paths). The user dropped the app and asked for a
coordinator with fixed role agents instead.

**What it cost.** An evening of setup and teardown: 40 worktrees, 40 branches,
four team folders, rescue and verification of the teams' documents, and a
second rewrite of CLAUDE.md within a day.

**The habit.** Before moving the whole project onto a new orchestration tool,
run one small team (two or three members, one real read-only task) end to end
and check the three things that broke here: the tool's runtime version against
the model, the machine's load, and whether messages arrive once. Scale up only
after that passes.

---

## 14. A migration went into the shared database before it went into main

**What happened.** 2026-09-26, BL-080. After the security approval I had the
owner-legal-name migration applied permanently to the local database so the
full gate (test:db, e2e) could run. The rule allowed it. But that database is
shared: main still held the old versions of six green-list test files, so
they turned red for every other session, and the coordinator's rollback
trials on those files proved nothing until BL-080 landed. The coordinator had
to ask who applied it and whether it would change.

**What it cost.** A stop-and-explain round with the coordinator, other
sessions' checks blind for about an hour, and a push hurried to close the gap.

**The habit.** A permanent apply to the shared database changes the ground
under every session, not just my branch. Tell the coordinator before applying,
with the sha and when it will reach main, and keep the gap between applying
and pushing as short as possible -- apply as the last step before the push,
not as the first step of the gate.

## 2026-09-26 — Kapı sonucu okunmadan main'e gönderildi
**Ne oldu:** BL-142 (yalnız CSS) için tam kapıyı arka planda koşturdum, bitince tek komutta rebase + push yaptım. Kapı `exit=1` verdi (web vitest 2 dosya / 6 test kırmızı) ama push aynı komutta sonucu kontrol etmeden gitti (`a4638b4`). Kırmızılar yük kaynaklı süre aşımıydı (aynı iki dosya tek başına 74/74), ana dal sağlam kaldı — şans.
**Bedeli:** Kural (CLAUDE.md §6 adım 4: rebase sonrası tam kapı yeşil) çiğnendi; gerçek bir kırmızı olsaydı main kırılırdı.
**Alışkanlık:** push, kapı logunda `=== ALL GREEN` yoksa çalışmaz: `grep -q "=== ALL GREEN" log && git push ...`. Kapı ile push asla aynı "sonra ne olursa" zincirinde değil.
**Tekrar, 2026-09-26 akşam (nf-db, BL-208):** hafıza notunu `fb61-5`'ten `bl208`'e `git cherry-pick` ile taşırken aynı komutta `git branch -D fb61-5` de vardı; cherry-pick çatışmayla durdu ama silme yine koştu. Bedeli: kayıp yok (commit nesnesi `a11dbf7` sha ile duruyordu, çatışma çözülüp alındı), ama taşınmamış tek commit'in tek dalı silinmişti. Aynı kök: geri dönüşü zor adım, öncekinin sonucunu okumadan aynı zincirde. Silme ve push hep ayrı çağrıda, önceki adımın çıktısı okunduktan sonra.

## 2026-09-26 — Bağlam izlenmedi, rol oturumları yerine her şey alt ajana gitti
Ne oldu: koordinatör oturumu bir kez kendiliğinden sıkıştırıldı, ardından yine şişti; iş sınırlarında
"sıkıştır / devret" önerisi hiç yapılmadı. Sabah oturumlar arası mesaj sınırı yüzünden alt ajanlara
geçildi, sınır kalkınca rol oturumlarına dönülmedi: onlarca rapor tek pencereye aktı, kullanıcı işleri
izleyemedi. Kullanıcı düzeltti.
Maliyet: bağlamın dolmasıyla yavaşlama ve kalite riski; kullanıcının kendi fark edip söylemesi gerekti.
Alışkanlık: her iş bitişinde bakım satırında bağlam doluluğu; yarıyı geçince devir raporu + yeni
oturum. Bir kısıt yüzünden geçici yola sapılınca, kısıt kalkınca asıl yola dönülür. Kural CLAUDE.md
§11.10'a yazıldı (`41e337f`).

## 2026-09-28 — Seçenek metnindeki ayrıntı kullanıcı kararı diye kayda geçti
Ne oldu: nf-planlama BL-252 S2'yi "(b) muafiyetler kalkar, süreler baştan başlar" diye yazdı. Koordinatör
cevabı "S2 (b): muafiyetler kalkar, admin olarak tamamlar" diye iletti. Kayıtta seçeneğin tam metni
("süre devir anından başlar") ve cevapta hiç geçmeyen bir kural ("elle verilmiş muafiyetler kalır")
REUSE'a karar olarak yazıldı. Koordinatör main'e almadan yakaladı.
Maliyet: bir düzeltme turu (`297babb0` → `c088f2f8`). Yakalanmasaydı nf-db iki ölçülmemiş varsayımı
ürün kuralı sanıp koda geçirecekti.
Alışkanlık: kararı kayda geçirirken yalnız iletilen cevabın kelimeleri yazılır. Seçenek metninden ya da
kendi çıkarımından gelen her ayrıntı ayrı bir "açık soru" satırına gider, karar satırına girmez. Kontrol:
karar satırındaki her cümle, gelen mesajda karşılığı olan bir cümleye işaret edebilmeli.

## 2026-09-28 — Denetimde alt ajanın alt ajanları geç geldi, işler iki kez koşturuldu
Tüm-repo kod denetiminde (newfork) dört nf-guvenlik alt ajanı kendi alt taramalarını başlattı, ana raporu
"alt taramalar bitmedi" diye erken verdi. Ben eksik kısımları yeniden başlattım (API 3 parça, web 1, DB 3);
sonra orijinal alt taramalar birer birer geç geldi. Sonuç: API ve web derin taramaları iki kez koştu
(~6 ajan × ~250k token), DB'de üç kopyayı elle durdurmak gerekti. Alışkanlık: alt ajan görevine baştan
"alt ajan başlatma, tek başına bitir" yaz; "alt tarama sürüyor" diyen rapor gelince ana ajanın
"no live background children" bildirimini bekle, ondan önce yeniden başlatma.

## 2026-09-28 — Kapsam dışı bırakma, ölçülmemiş bir "bu hiç olmaz"a dayandı
Ne oldu: BL-252'de nf-db "acknowledgement satırları owner'a yalnız onboarding'de gelir" dedi; koordinatör
ölçtürmeden "acknowledgement'lar S2 dışında" kararını verdi ve kayda geçirtti. Kullanıcının açtığı
ultrareview yakaladı: politika onayları apply_policy_definition_service ile owner ve admin'lere de
geliyor; eski owner "Employee handbook" onayından kalıcı muaf kalıyordu.
Maliyet: bir düzeltme turu (7035aba7 → 012b47d2), bir inceleme turu daha; ultrareview hakkı harcandı.
Alışkanlık: bir şeyi kapsam dışı bırakmanın gerekçesi "bu durum oluşmaz" ise, karar vermeden önce o
iddia tek bir SELECT ya da grep ile ölçülür (kim, hangi yoldan bu satırı üretiyor). Ölçülmeden
bırakılan kapsam dışı, "açık soru" olarak yazılır, karar olarak değil.

## 2026-09-28 — Yeni test dosyası sanılan mevcut dosyanın üzerine yazıldı
Ne oldu: SEC-003 parça B'de `apps/web/src/auth/AuthContext.test.tsx` için "test yok" sonucunu yalnız
`grep signUp` ile çıkardım (dosyada signUp geçmiyordu) ve Write ile yeni dosya açtım. Dosya vardı; dört
oturum testi silindi, commit'e girdi. `git status`'ta `M` (değil `??`) görünce fark edildi, düzeltme
commit'iyle geri getirildi.
Maliyet: bir düzeltme commit'i, bir tam web koşusu daha.
Alışkanlık: Write'tan önce hedef yolu `ls` ile yokla; "bu konuda test yok" hükmü içerik grep'iyle değil
dosya adıyla verilir.
İkinci kez, aynı gün (`nf-planlama`, BL-291): BACKLOG.md'yi düzenleyen Python betiği dosyayı yazmak için
açtı, ardından kodlama hatasıyla düştü. Hata, betikteki bir çift tırnağın metni erken kapatmasından
çıktı. Dosya boşalmıştı. Aynı komut satırında `&&` olmadan zincirlenen `git commit` bozuk dosyayı
commit'ledi (`e7086541`, 464 satır silindi). Diff'teki "464 deletions" görülünce fark edildi; commit
geri alındı, dosya son sağlam commit'ten geri yüklendi, main'e ulaşmadı. Maliyet: üç tur ve bir hata
bildirimi. Ortak ders: bir dosya sessizce ezilir, commit'e girer ve ancak sonradan fark edilir.
Ek alışkanlık:
- Dosyaya yazan betik önce bütün metni üretip kodlar, dosyayı ancak sonra açar.
- Commit, betikle aynı komutta yalnız `&&` ile zincirlenir.
- Commit'ten önce `git diff --stat` okunur; beklenmeyen silme sayısı, `??` yerine `M` görmek gibi, durma işaretidir.
Üçüncü kez, 2026-09-29 (`nf-planlama`, BACKLOG-PROGRAM): `open(p, "wb").write(open(p).read() + ek)` —
Python dıştaki `open(p, "wb")`'yi içteki okumadan önce çalıştırdığı için dosya boşaldı. 212 satırlık program
dosyası yalnız ek tablo olarak kaldı ve bir commit'e girdi (`66724abc`). Gönderilmeden fark edildi, dosya
yeniden üretildi, onarım ayrı commit'le kondu (`2da79800`). `git diff --stat` okunmadı, çünkü yeni dosyalar
stat'ta görünmüyordu. Maliyet: bir yanlış commit ve üç ek tur. Ek alışkanlık: aynı dosyayı okuyup yazan
her satır iki adıma bölünür (önce `body = read()`, uzunluğu `assert` edilir, sonra yazılır). Commit'ten sonra
anahtar içerik Python ile sayılır.
Dördüncü kez, 2026-09-30 (`nf-planlama` kayıt oturumu, besleme #5): üç dosya yazan betik ilk dosyayı
yazdıktan sonra `print("yazıldı")` satırında düştü (Windows konsolu cp1252, "ı" kodlanamadı); öteki iki
dosya yazılmadı. Bu kez zarar olmadı: bütün `assert`'ler yazmadan önce geçmişti, commit ayrı komuttaydı,
betik yeniden koşulunca aynı sonucu verdi. Maliyet: bir tur. Ek alışkanlık: Python'u `PYTHONIOENCODING=utf-8`
ile çağır; yazma döngüsünün içine düşebilecek hiçbir şey (Türkçe `print` dahil) koyma.
Aynı oturumda ikinci ders: "Sayım satırı bayat" diye koordinatöre yanlış not gitti, çünkü 4 bin karakterlik
maddenin yalnız ilk 900 karakteri okunmuştu (`cut -c1-900`); güncel sayı maddenin sonundaydı. Maliyet: bir
düzeltme satırı. Alışkanlık: kesik okuma yer bulmak içindir; hüküm verilecek satır tam okunur.

## 2026-09-28 — Koordinatör kendisi dağıldı; kullanıcı iki kez yön düzeltti
Ne oldu: devirden sonraki ilk saatte koordinatör (Newfork) iş yerine çevre temizliğine kaydı —
eski projenin ~60 oturumunu arşivlemeyi sordu (kullanıcı: "Dokunma", sonra "Newfork-clean
dışında bir şey konuşuyoruz"), bir tasarım eleştirisini kurtarmakla uğraştı. Aynı gün kullanıcı
"hep aynı yerdeyiz, her iş büyüyor ya da konu kayıyor" dedi; "hızlanmak"ı koordinatör "aynı anda
iki iş" diye okudu, kastedilen "bir işi parçalara bölüp aynı anda birkaç oturumda ilerletmek" idi.
Maliyet: iki düzeltme turu, bir strateji konuşması; kök nedenlerden biri CLAUDE.md'deki "her iş
sonunda backlog'dan öner" kuralıydı (kaldırıldı, tek hat kuralı yazıldı, 1d349d2a).
Alışkanlık: temizlik ve öneri yalnız aktif projenin ve aktif hedefin içinden; "sıradaki iş"
yargıyla değil plan tablosundan hesaplanır (ILERLEME sürüm 5). Kullanıcının bir fiilini
("hızlanmak") yorumlamadan önce seçenekleri tek tıkla sor — burada soruldu ve cevap
seçeneklerin hiçbiri değildi, serbest metindi.
Aynı gün iyi giden: SEC-003 dört parçaya bölünüp (DB, iki API/web, test) aynı anda yürüdü,
dosya çakışmasız birleşti, ~6 saatte main + hosted; neden: her parçanın dosya listesi ve
"dokunma" listesi görev mesajında açıkça yazılıydı.

## 2026-09-28 — Üç görsel varyantın hiçbiri beğenilmedi; aynı fikrin üç çeşidiydi
Ne oldu: BL-199'da (Schedule kartında not işareti) nf-arayuz üç varyant hazırladı: sağ üstte
simge, köşede üçgen, kartta notun ilk satırı. Üçü de "küçük bir işaret" fikrinin çeşitleriydi.
Ekran görüntülerinde yalnız bir notlu kart görünüyordu ve örnek not ("Open shift") bir durum
etiketi gibi okunuyordu. Diğer örnek kart, ızgara yana kaydığı için görüntüye girmemişti.
Koordinatör bunları gördü ama yine de gönderdi. Kullanıcı: "hiçbirini beğenmedim, 10 farklı
profesyonel fikirle yeniden".
Maliyet: bir tasarım turu yeniden; 10 varyantlık galeri işi.
Alışkanlık: görsel seçim için varyant isterken biçimce gerçekten farklı fikirler iste ve
her birinin dayandığı profesyonel ürünü yazdır. Örnek veri gerçekçi olsun (kısa not, uzun
not, notsuz kart, diğer işaretlerle çakışma). Kullanıcıya göndermeden önce görüntüleri kendin
aç; karar verdirmeyecek görüntüyü rolüne geri gönder, kullanıcıya iletme.
Aynı gün ikinci kez: kaynaklı, gerçekçi veriyle hazırlanan 10 fikrin de hiçbiri seçilmedi
("hiçbirisi. yeni design yaptırıyorum"); kullanıcı tasarımı kendi eline aldı. Maliyet: iki
tasarım turu (3 + 10 varyant). Kök neden daha derin: iki turda da kullanıcıya ne görmek
istediği hiç sorulmadı; memory'deki [[consult-before-solving-ui]] ("önce dinle") uygulanmadı.
Alışkanlık: görsel kararda varyant üretmeden önce tek tıklık bir soru turu — neye benzesin, hangi
üründe beğendiği bir örnek var mı, ne istemiyor. İş görsel karara takılınca da görselden
bağımsız kısmı ayır ve yürüt (burada not alanı ayrıldı, kullanıcı onayıyla).
İkinci kez, aynı gün: yukarıdaki alışkanlık uygulandı. Biçimce farklı 10 fikir yapıldı, her biri
doğrulanmış bir kaynağa dayanıyordu, veri gerçekçiydi, görüntüler gönderilmeden kontrol edildi.
Kullanıcının cevabı: "hiçbirisi. yeni design yaptırıyorum". Tasarımı Superdesign ile kendisi
yürütmeye başladı. Maliyet: yaklaşık 4 saatlik galeri işi (kod, 46 ekran görüntüsü, kaynak
araştırması). Ek alışkanlık: bir görsel tur reddedilince ikinci turu kodda kurmadan önce kullanıcıya
iki şey sor. Birincisi, reddedilen turda onu en çok ne rahatsız etti: çok küçük mü, çok gürültülü
mü, profesyonel görünmüyor mu? İkincisi, beğendiği bir ekran örneği var mı? Varyantlar kodda değil,
önce ucuz bir ortamda (eskiz ya da tasarım kanvası) denensin; yönü bulunan fikir sonra koda geçsin.
Üçüncü kez, 2026-09-28 akşam (Schedule sağ üst dört pencere), bu sefer işe yaradı: varyanttan önce
tek tıklık soru turu yapıldı (hangi pencereler, ne kadar farklı, neye benzesin, ne rahatsız ediyor).
Kullanıcı üç referansı kendisi seçti, her referanstan bir mockup; gerçek bileşen, gerçekçi veri,
bugünkü hâlle yan yana. İlk turda seçti (önce C, bir dakika sonra B). Neden işe yaradı: yönü kullanıcı
koydu, mockup'lar yalnız o yönü gösterdi.
Aynı işte "kendin aç" alışkanlığı kaçtı: telefon görüntüsünü (mobile-1) kanıt diye çektim, açmadan
"telefon kontrol edildi" saydım; görüntü panelin kesildiğini gösteriyordu. nf-gorsel-qa engelledi.
Maliyet: bir inceleme turu (sonucu iyi oldu: kök neden daha büyük çıktı, menüler telefonda hiç
görünmüyordu). Alışkanlık: kanıt diye çekilen her görüntü, "bitti" denmeden açılıp bakılır; çekmek
bakmak değildir.
2026-09-28 gece, ikinci kez (boş Schedule ızgarası): görüntüyü açtım ama yalnız istenen maddelere
baktım. TOTAL sütununun boş alanında satır çizgileri yoktu; kullanıcı gönderdiğim görüntüde gördü
("sanki total hours rowlarının çizgileri silinmiş gibi"). Maliyet: bir düzeltme commit'i ve iki
incelemeye ek mesaj. Alışkanlık büyüdü: açılan görüntüde istenen maddeler kadar komşularına da
bakılır. Aynı türden hücreler aynı çizgiyi, rengi ve hizayı taşıyor mu, sütun sütun tara.

## 2026-09-28 — Parça parça incelenen iş, bütün aralığa bakan tek incelemede 3 hata verdi
Ne oldu: BL-199'da (vardiya notu) her parça nf-guvenlik ve nf-gorsel-qa'dan ayrı ayrı ONAY
aldı, main'e girdi. Kullanıcı son dal için /code-review istedi ("yeni bi sessiona bu taski
ilet"). Bütün aralığa (b362a5ee..final) tek seferde bakan inceleme 11 bulgu verdi. Üçü
davranış hatasıydı ve ikisi zaten main'deydi:
- Escape açık düzenleyiciyi kapatıp yazılanı siliyordu; güvenlik bu durumu "kabul edilebilir"
  demişti.
- Notlu açık vardiya yığında kayboluyordu.
- Alttaki nota fareyle ulaşılamıyordu.
Ardından O1 çıktı: yığın anahtarının ikizi.
Maliyet: bir düzeltme turu daha (11 commit), iki inceleme turu; main'e ikinci kez kod girdi.
Neden: parça incelemesi yalnız kendi farkına bakıyor. Parçalar arası etkileşim (not ×
düzenleyici × yığın × ölçüm) hiçbir farkın içinde değil.
Alışkanlık: birden çok parçaya bölünen bir UI işinde, son main'e almadan önce bütün aralığa
bakan tek bir inceleme koştur. Parça onayları bunun yerine geçmez. İyi giden: incelemeyi ayrı
oturuma vermek koordinatörün bağlamını korudu.

## 2026-09-29 — Üç görsel varyant da reddedildi; istenen şey stil değil yapıydı
Ne oldu: Account → Profile yeniden tasarımında aynı içeriği üç farklı yerleşimle (ayar
satırları / kartlar / dar akış) hazırladım. Kullanıcı "hiçbiri" dedi ve yapıyı kendisi verdi:
legal name en üste, display name onun altına ve adı "Preferred name", tek Save, bir bölüm
tamamen silinsin, bir bölümün adı değişsin, "daha kompakt".
Maliyet: bir varyant turu (üç CSS yönü ve geçiş düğmesi), sonra hepsi silindi.
Neden: "tasarım dağınık" şikâyetini yerleşim sorunu diye okudum. Asıl sıkıntı hangi bilginin
sayfada olduğu, sırası ve adıydı. Varyantlar içeriği sabit tuttuğu için bunu hiç sormadı.
Alışkanlık: yeniden tasarım isteğinde varyant çizmeden önce içerik envanterini (bölümler,
sıraları, adları; silinebilir mi, birleşebilir mi) tek soru turunda göster. Varyant yalnız
içerik onaylandıktan sonra görsel dil için çizilir.

## 2026-09-29 — A failed lock did not stop the push
What happened: `lock take main` failed (nf-db held it), but the command chain
used `;` after it, so fetch/commit/push ran anyway and a docs commit reached
main without the lock. Cost: a rule broken, a peer's push may have to rebase,
an apology in the report.
Habit: a gate step (lock take, merge check, test) is its own call, or joined
only with `&&` to everything after it — never `;`.

## 2026-09-29 — Ekran davranışını değiştiren iş, etkilenen e2e koşulmadan main'e girdi; main kırmızı oldu
Ne oldu: schedule-windows-2'de New Schedule menüsündeki canlı taslak satırı "Edit live schedule"
düğmesini taşımaya başladı. Birim, App, pgTAP testleri ve tam kapı yeşildi. Ama CLAUDE.md §6'daki
"ekran davranışı değiştiyse etkilenen e2e senaryoları" adımını atladım. Main CI'da iki e2e düştü:
schedule-multi-location ve schedule-shift-note. Sebep: adsız bir `role="button"` satır, adını içindeki
düğmelerden alıyordu; Playwright'ın kısmi ad eşleşmesi hem satırı hem düğmeyi buldu.
Maliyet: main yaklaşık 40 dakika kırmızı kaldı. İki düzeltme commit'i, iki inceleme ve iki tam kapı daha
gerekti.
Alışkanlık: bir menüde ya da pencerede etiket, satır ya da düğme değişiyorsa main'e almadan önce
`e2e/` altında o etiketi ve ekranı `grep` et, eşleşen senaryoları db.lock ile koştur. Adsız
`role="button"` bir öğeye her zaman kendi `aria-label`'ını ver.
Tekrar 2026-09-29 akşam (G1): Unpublish iki tıka geçti (BL-306). Yalnız dalın kendi 9 test dosyası
koşuldu, `App.test.tsx`'teki unpublish akış testi koşulmadı. T4 toplu dalında CI "check" kırmızı
oldu, bir düzeltme turu ve tam web vitest gerekti. Genişleyen alışkanlık: bir düğmenin tıklama
biçimi, adı ya da etiketi değiştiyse "bitti" demeden önce bütün web vitest koşulur (~90 sn), yalnız
değişen dosyaların testleri yetmez. Aynı etiket için `App.test.tsx` ve `e2e/` altında grep yapılır.
Tekrar 2026-10-01 gece (G14, ÜÇÜNCÜ kez): kart üstündeki tarayıcı `title` balonu kaldırıldı. Tam kapı
yeşildi ama e2e koşulmadan main'e alındı. `schedule-availability-warning.spec.ts:68` hâlâ `title`'ı
bekliyordu; main CI e2e kırmızı (36925374892). Maliyet: push donması, bir düzeltme commit'i, 4 dk yerel
e2e. Kural CLAUDE.md §6'da zaten yazılı; eksik olan kural değil uygulama. Öneri: ekran kodu değişen
dalda push öncesi e2e'yi zorlayan mekanik kapı; hatırlamaya güvenmek üç kez tutmadı.

## 2026-09-29 — Kullanıcının gördüğü hata, ana klasördeki bayat paket derlemesiydi; kodda arandı
Ne oldu: kullanıcı "sil düğmesi görünmüyor ve çalışmıyor" dedi. Ben kodda aradım, kendi worktree
sunucumda (taze `packages/*` derlemesiyle) düğmeyi görünür buldum, hover kuralını suçladım ve değiştirdim.
Düzeltme main'e girdi ama kullanıcı "hala yok" dedi. Gerçek sebep: ana klasördeki `packages/ui/dist`
21 Eylül tarihliydi, ConfirmButton'ın `unstyled` prop'u 22 Eylül'de gelmişti; kullanıcının 5555
sunucusu düğmeyi genel `nf-button` görünümüyle, beyaz üstünde görünmez çiziyordu.
Maliyet: bir tur yanlış teşhis, kullanıcıya iki kez "düzeldi" denmesi.
Alışkanlık: kullanıcı kendi sunucusunda gördüğü bir görünüm hatasını bildirince önce ONUN sunucusunda
(5555) aynı ekranı aç ve DOM'a bak; kendi worktree'nde görmemek o hatanın olmadığını göstermez. Ana
klasörde `packages/*/dist` tarihini kaynakla karşılaştır.

## 2026-09-29 gece — Newfork koordinatör: rol raporları koordinatöre ulaşmadı
Ne oldu: nf-gorsel-qa'nın G9b görsel QA raporu üç kez `send_message` ile gönderildi, hiçbiri ulaşmadı;
koordinatör sürekli bir turda olduğu için mesaj 20 sn içinde tur başlatamadı ve düştü. Aynı gece
meşgul bir işçiye giden "önce güvenlik bulgusunu düzelt" mesajı kuyrukta bekledi, işçi başka işe geçti.
Maliyet: G9b QA sonucu ~1,5 saat gecikti; T5b güvenlik düzeltmesi bir tur geç başladı.
Alışkanlık: rol oturumundan uzun rapor dosyaya yazılır (kendi worktree'si, `artifacts/<rol>/<iş>/RAPOR.md`),
mesajla yalnız tek satır gelir. İşçi raporu gelince iddia ettiği sırayı dalda ölç (`git log`/`git diff`).

## 2026-09-30 — Newfork nf-guvenlik: "düğme yalnız X'te çıkar" iddiası tek bölüme bakılarak verildi
Ne oldu: FB-6.2 `.7b` incelemesinde "davet düğmeleri yalnız hesabı bağlı olmayan kişide çıkıyor, D3 sorun
değil" yazdım. Yalnız `AccessSection`'ı okumuştum; çekmecenin alt çubuğundaki ayrı "Invite" düğmesi
(`EmployeeDrawer.tsx:1329`) bağlı hesapta da açıktı. Görsel QA ekranda yakaladı.
Maliyet: bir QA turu, bir düzeltme dalı ve bir yeniden inceleme; onay raporu yanlış güvence verdi.
Alışkanlık: "şu eylem yalnız şu durumda görünür" demeden önce eylemi tetikleyen çağrıyı (mutation/servis
fonksiyonu) grep'le ve bütün çağıranları listele; bir bileşeni okumak yetmez. Raporda o listeyi tablo olarak ver.

## 2026-09-30 — Newfork nf-backend: rol hafızası işten sonra okundu, kural iki kez yazıldı
- **Ne oldu:** EMP-001 B2 görevinde "manager lokasyonsuz kalamaz" kuralını önce istemciden gelen bir bayrakla (`is_manager_record`) ortak şemaya koydum (`576e3f05`). Rol hafızasındaki `db-decides-client-mirrors` notu (BL-218 incelemesi) tam bu kalıbı reddediyordu. Notu, iş bittikten sonra hafıza klasörüne yeni not yazarken gördüm.
- **Maliyeti:** shared kural, çekmece bağlaması ve testleri bir kez yeniden yazıldı (`a666a9b4`); koordinatöre giden ara mesajda yanlış tasarım anlatıldı, düzeltme mesajı gerekti.
- **Alışkanlık:** rol dosyası okunurken `.claude/agent-memory/<rol>/MEMORY.md` dizini de okunur; görev bir forma ya da şemaya kural ekliyorsa ilgili not koddan önce açılır. Görev mesajındaki "Oku (yalnız bunlar)" listesi hafıza dizinini dışarıda bırakmaz.

## 2026-09-30 — Newfork G18: iki düzenleme tek pakette gitti, kapı ilkini reddedince dosya yarım kaldı
- **Ne oldu:** Aynı dosyaya iki `Edit` aynı pakette gönderildi. Düzenleme kapısı (GateGuard "önce gerçekleri yaz") dosyaya ilk dokunuşu reddetti, ikincisi uygulandı. İki kez oldu: test yardımcısı eksik kaldı (iki hücre yanlış nedenle kırmızı göründü), sonra bileşende tanımsız tip kaldı (typecheck 4 hata). Ayrıca `printf`/`sed` ile yazılan ters eğik çizgiler yarıya indi, `launch.json` bozuldu.
- **Maliyeti:** dört fazladan tur ve bir yanlış kırmızı okuma; iş bozulmadı.
- **Alışkanlık:** bu oturumda ilk kez dokunulan dosyaya ilk düzenleme TEK başına gider, gerçekler mesajda önceden yazılır; aynı dosyaya ikinci düzenleme ancak ilki geçtikten sonra. Windows yolu içeren dosya `printf`/`sed` ile değil düzenleme aracıyla yazılır.
- **Tekrar 2026-09-30 (BL-467):** aynı gün iki kez daha: test düzenlemesi testin koşusuyla aynı pakette gitti (koşu eski kodu ölçtü), rapor yazımı Koordinatör mesajıyla aynı pakette gitti (mesaj, rapor henüz yokken teslim edildi). Kural genişler: kapıya takılabilecek bir yazma, ona bağlı hiçbir çağrıyla aynı pakette gitmez.
- **Tekrar 2026-10-01 (KARAR-001):** bu oturumda 13 ilk-dokunuş reddi (yeni dosya, CLAUDE.md, rol dosyaları, hafıza). Gerçekler önceden yazıldığı için bozulma olmadı; maliyet yalnız tekrar turu. Paralel pakette bir dosya geçip öteki takıldı (`nf-arayuz` geçti, `nf-planlama` takıldı); ikincisi tek başına yeniden gönderildi.
- **Tekrar 2026-10-01 (koordinatör, BL-500 / HANDOFF / KK):** aynı gün üç kez daha: aynı dosyaya iki düzenleme paralel gitti, ilki kapıya takıldı, ikincisi uygulandı. `guard.mjs`'te yarım dosya 27 testin 10'unu kırdı (bir tur kaybı); yakalayan test koşusuydu. Kural aynı: ilk dokunuş tek başına, gerçekler önce.
- **Tekrar 2026-10-04 (işçi 2, FB-6.7):** bir deneme sayfasına sekiz düzenleme paralel gitti. İlki kapıya takıldı, yedisi uygulandı; takılan ötekilerden bağımsız olduğu için bozulma olmadı. İki yeni rapor dosyasında da ilk `Write` reddedildi; birinde gerçekler önceden yazılmıştı, kapı yine reddetti. Yeni dosyada ilk dokunuş her zaman iki tur sürüyor; maliyet üç fazladan tur.

## 2026-10-01 — Newfork KARAR-001: "ilke dosyası öneri isabetini artırır" varsayımı ölçülünce tutmadı
- **Ne oldu:** Plan, Mert'in ilkeleri yazılınca "(Önerilen)" isabetinin %67'den %85'e çıkacağını varsaydı. Zaman bölmeli geriye dönük test yaptım: ilkeler 26 Eylül öncesinden çıkarıldı, 27-30 Eylül'deki 255 soruda denendi. İlkeler seçenekler arasından seçmeyi iyileştirmedi: ilkeli %68,6, ilkesiz %70,6, o günkü öneri %71,8. Kaybın büyüğü, Mert'in istediği şeyin hiçbir seçenekte olmadığı %20'lik serbest cevaplardaydı.
- **Maliyeti:** yok, çünkü ölçüm iş bitmeden yapıldı. Mekanizmanın ağırlığı seçimden seçenek setine kaydı: serbest cevap kurala döner, şablon, eksik kurallar. Ölçülmeseydi hedef tutmayınca yanlış yere daha çok ilke yazılacaktı.
- **Alışkanlık:** bir sayıyı hedef koymadan önce, onu taşıyacağı varsayılan mekanizmayı eski veride, zaman bölmesiyle (sızıntısız) dene. "Doğru seçeneği seçmek" ile "doğru seçeneği sunmak" iki ayrı ölçümdür; hangisinin kayıp olduğunu önce ayır.

## 2026-10-01 — Newfork koordinatör: "boş oturum havuzu bitti" devir notundan alındı, ölçülmedi; kullanıcıya iş yüklendi
- **Ne oldu:** HANDOFF "havuz boş: kullanıcı oturum açar" diyordu. Yeni nf-db gerekince kullanıcıdan iki kez "boş oturum aç" istedim. Kullanıcı: "yeni bir sürü session açık." `list_sessions`'ta 19 boş havuz oturumu vardı ("Bekle: … idle (51)–(70)"); kullanıcı devirden sonra açmıştı.
- **Maliyeti:** kullanıcının bir mesajı ve FB-6.3'ün veritabanı kısmında ~20 dk bekleme.
- **Alışkanlık:** kullanıcıdan bir şey istemeden önce o şeyin zaten var olup olmadığını o an ölç (`list_sessions` bir çağrı). Devir notundaki durum cümlesi ölçüm değil, o anın fotoğrafıdır.

## 2026-10-01 — Newfork koordinatör: worktree silinmeden önce git dışı raporlar kontrol edilmedi
- **Ne oldu:** eski nf-db'nin worktree'sini "temiz" diye sildim; ölçümüm `git status --porcelain` idi, gitignore'daki `artifacts/`'ı göstermez. `git worktree remove` o klasörü de götürdü. HANDOFF §2'de "raporlar önce arşive kopyalanır" kuralı yazılıydı.
- **Maliyeti:** nf-db'nin BL-475/G8b ekran görüntüleri ve ara notları (varsa) kayboldu; kayıtlar onlara bağlanmıyordu, rapor posta kutusunda kaldı. Etkisi düşük, şans eseri.
- **Alışkanlık (2):** CI'ın yaptığı her kontrol yerel "tam kapı"da yok. 2026-10-01 aynı gün: FB-6.3 gönderiminde lint/typecheck/test/build yeşildi, main CI `db` işi "Green list only grows" adımında düştü (iki yeni pgTAP dosyası `ci-green.txt`'e eklenmemişti); main ~25 dk donuk kaldı, bir düzeltme commit'i. Yeni pgTAP dosyası taşıyan gönderimden önce `bash scripts/ci-green-guard.sh <origin/main>`.
- **Alışkanlık:** worktree silmeden önce `git status --porcelain --ignored` (en az `artifacts/`); varsa önce `newfork-wt/coord/artifacts/archive-<tarih>/<worktree>/`'a kopyala. "Temiz" iki ayrı soru: commit'lenmemiş iş var mı, git dışı kanıt var mı.

## 2026-10-01 — Newfork nf-arayuz FB-6.3.6b: "ortak toast" kuruldu, ölçülünce çekmecenin içine taşındı
- **Ne oldu:** QA D1 için bütün karar mesajlarını ortak toast'a verdim, testleri de ona göre yazdım. Görüntüde toast çekmecenin üstünde duruyordu. Üstteki öğeyi ölçünce (`elementFromPoint`) arka plan çıktı: `CatalogDrawer` açıkken sayfanın geri kalanını `inert` yapıyor, Toaster da o ağacın içinde. Yani toast görünür ama tıklanmaz ve ekran okuyucu okumaz. Uygulamanın kendi deseni (Employees çekmecesi) zaten "açık kalınca içeride satır, kapanınca toast" idi.
- **Maliyeti:** iki test ve bir kod geçişi yeniden yazıldı, ~15 dk.
- **Alışkanlık:** bir mesajı "kişinin baktığı yerde" göstermek için bir katman seçmeden önce, o katmanın açık modalla birlikte erişilebilir kaldığını ölç: ekran görüntüsü yetmez, üstteki öğeyi ve `inert`'i kontrol et. "Ortak bileşen var" sorusundan önce "uygulama bu durumda ne yapıyor" sorusu gelir; desen, bileşenin adında değil kullanım yerindedir.

## 2026-10-01 — Newfork koordinatör: BL-505'i "kapandı" diye besledim, maddenin işi başkaydı
- **Ne oldu:** HANDOFF'ta "nf-gorsel-qa kanıtlarını arşivden önce kopyala (BL-505)" satırı vardı; kopyalayınca BL-505'i kapandı diye kayıt oturumuna besledim. BL-505'in işi aslında dört yüzeye görsel QA turuydu; kopya yalnız maddedeki bir yolu güvenceye alıyordu. Kayıt oturumu maddeyi okuyup kapatmadı ve sordu.
- **Maliyeti:** bir besleme turu + düzeltme mesajı (~5 dk); yanlış kapanış kayda girmedi.
- **Alışkanlık:** bir BL'yi kapatmadan (ya da kapatma beslemesi göndermeden) önce maddenin ilk cümlesini — işin kendisini — oku; başka bir belgede maddeye yapılan atıf maddenin işi değildir.

## 2026-10-01 — Newfork nf-arayuz FB-6.3.6c: yazımı reddedilen rapor yerine eskisi posta kutusuna gitti
- **Ne oldu:** Rapor dosyasını yazma ile `inbox.mjs send`'i aynı paralel turda çağırdım. GateGuard yazımı ilk denemede reddetti; gönderim yine koştu ve scratchpad'deki bir önceki işin (FB-6.3.6b) raporunu FB-6.3.6c adıyla bıraktı.
- **Maliyeti:** koordinatörün kutusunda yanlış bir rapor; ikinci gönderim ve düzeltme notu, ~2 dk. Fark edilmeseydi koordinatör eski işi yeni sanacaktı.
- **Alışkanlık:** bir çağrının çıktısına bağlı komutu onunla paralel gönderme; özellikle reddedilebilen (kapılı) bir yazımla. Gönderimden önce dosyanın ilk satırını oku.
- **Tekrar 2026-10-01 (nf-db FB-6.3.8c):** aynı tur iki kez daha: (a) soru raporunu yazma + `inbox.mjs send` paralel → yazım kapıda reddedildi, gönderim ENOENT ile düştü (eski dosya yoktu, şans); (b) aynı dosyaya iki `Edit` paralel → kapı ilk düzenlemeyi reddetti, ikinci (silme) uygulandı, matris ve TS ikizi bir an yarım kaldı; `git diff` ile yakalandı. Maliyet ~3 dk. Kural güçlendi: kapılı bir dosyaya ilk dokunuşu tek başına gönder; bağlı adımı ancak sonucunu gördükten sonra.

## 2026-10-01 — Newfork nf-db FB-6.3.8c: tasarım ve soru, onları yargılayacak şeyi okumadan kuruldu
- **Ne oldu:** Keşif raporunda "tek yardımcı, servis süzer" tasarımını önerdim ve onaylandı; uygulamaya geçince yetki matrisinin servisi ve çekirdeği aynı beklentiyle karşılaştırdığını gördüm — yardımcı matrisi yeşile çeviremezdi, tasarım çekirdek kuralına döndü. Aynı raporda "belgesi eksik müdür görsün" kararını teknik diye verdim; KARARLAR "Kısıtlı kişi" satırı ve çekirdeğin `document_blocked`'ı bunu zaten kapatıyordu. Mert bu çelişkiyi bilmeden "görsün" dedi, sonra geri aldı.
- **Maliyeti:** bir soru turu daha (koordinatör + Mert), Mert'e çelişkili bir karar aldırıldı, ~20 dk.
- **Alışkanlık:** bir yetki/okuma tasarımı önermeden önce onu yargılayacak testi (matris `expected()` + çekirdek karşılaştırması) oku; "teknik karar" diye bir davranış yazmadan önce o davranışa dokunan KARARLAR satırını ve çekirdeğin bugünkü cevabını ölç.

## 2026-10-02 — Newfork işçi FB-6.7: silinecek fonksiyonun çağıranına bakmadan sildim
- **Ne oldu:** Eski duyuru yardımcısını kullandığı için `get_notifications_service`'i silme migration'ına koydum; "API v2'yi kullanıyor" diye yalnız TypeScript'e baktım. Test koşusunda Workspace ana sayfasının (`get_workspace_dashboard_service`) onu SQL içinden çağırdığı çıktı; fonksiyonu geri koyup kapısını çekirdeğe çevirdim.
- **Maliyeti:** migration, silinenler listesi ve sınıflandırma testinde geri dönüş; ~10 dk.
- **Alışkanlık:** bir DB fonksiyonunu silmeden önce çağıranlarını iki yerde ara: kodda (`grep`) ve veritabanında (`pg_proc.prosrc ~ '<ad>'`).
- **Yine, 2026-10-04 (Newfork prototip, P1 Requests):** `TO_SEED` satırının biçimini değiştirdim. Sözleşmenin dediği gibi yalnız `parts/*.js`'te aradım, ama okuyucu bir derleme betiğiydi (`s4_sched.py`). Schedule 0 izin kaydıyla derlendi. Maliyeti: koordinatör okuyucuyu düzeltti, iki Schedule testi yeniden bakılacak. Alışkanlık genişledi: bir adın biçimini değiştirmeden önce derleme betikleri dahil bütün klasörde ara; sözleşmenin saydığı klasörle yetinme.

## 2026-10-02 — Newfork işçi FB-6.7: "hepsi geçti"yi süzülmüş çıktıdan okudum
- **Ne oldu:** pgTAP çıktısını `grep | uniq -c | head` ile süzdüm; ilk 10 satır hep "ok" geldi ve dosyayı yeşil sandım. Ayrı sayınca 56 ok / 5 not ok çıktı.
- **Maliyeti:** az; aynı turda yakalandı. Yakalanmasaydı yanlış "yeşil" rapora girecekti.
- **Alışkanlık:** pgTAP sonucunu her zaman `ok` ve `not ok` sayısını ayrı ayrı sayarak, plan satırıyla birlikte oku; süzülmüş bir örnek kanıt değildir.

## 2026-10-04 — Newfork koordinatör: tek seferlik talimatı kural sandım
- **Ne oldu:** Mert "sessionları toparla boşta olanları kaldır temizle" dedi. Netleştirme sorusunu "kuralın esnesin mi" diye kurdum, seçenekleri kural değişikliği olarak yazdım; Mert önerileni seçti, ben de KARARLAR OPS-07'yi "ters çevrildi" yazdırdım ve CLAUDE.md'yi değiştirmeyi önerdim. Mert: "Ben tek seferlik bir task vermiştim, kural değil."
- **Maliyeti:** kayıt oturumuna bir geri alma beslemesi, bir gereksiz soru turu, hafıza notunun iki kez yazılması (~10 dk).
- **Alışkanlık:** bir talimat yazılı bir kuralla çelişiyorsa önce "bu sefere mahsus mu, kural mı değişiyor?" diye ayır; varsayılan "bu sefere mahsus". Kural dosyasına ya da KARARLAR'a ancak Mert "bundan sonra hep" dediğinde yazılır.

## 2026-10-04 — İsim adayları zevk sorulmadan üretildi (newfork-clean, marka programı)
Ne oldu: "Newfork geçici" öğrenilince iki tur (40+ ad) aday üretildi; Mert ikisini de reddetti ("hiçbirisini beğenmedim"), sonra beğendiği tarzı söyledi (Linear, Stripe gibi kısa isimler). Maliyet: ~2 tur araştırma, iki ajan (~520k token), Mert'in iki seçim turu. Alışkanlık: isim/logo gibi zevk kararında aday üretmeden önce beğendiği 2–3 örnek markayı ve nedenini sor; kısıtları (alan adı) bu örneklerle birlikte sına.

## 2026-10-04 — Newfork işçi 2 (nf-arayuz): duyuru taslağı iki kez yeniden kuruldu
- **Ne oldu:** FB-6.7 davranış konuşmasında Mert yeni durum modelini verdi ve "bu yeni kurallar doğrultusunda artifactları güncelle" dedi. İki yeniden kurma oldu:
  - İlk güncelleme kuralların bir kısmını taşımadı. Mert: "artifact yeni kuralları yansıtmıyor". Sayfa baştan kuruldu (v2).
  - Mert, sormadan değiştirdiğim parçaları geri istedi: arama, durum sekmeleri, megafon ikonu, açılış animasyonu, büyük başlık. Mert: "senden değiştirmeni talep etmediğim değişiklikler yapmışsın". Ana daldaki yapı ve CSS alt ajanlarla çıkarıldı; v4 gerçek ekranın kopyası olarak kuruldu.
- **Maliyeti:** iki tam yeniden kurma turu ve Mert'in iki düzeltme mesajı. Bu sürede davranış konuşması ilerlemedi.
- **Alışkanlık:**
  - Taslak, gerçek ekranın birebir kopyasından başlar: ana daldaki bileşen ve CSS okunur, yalnız istenen değişir. Boş kalan yer kendi tasarımla doldurulmaz.
  - Yeni kural listesi gelince her kural, göstermeden önce sayfada tek tek işaretlenir. Eksik kalan söylenir.
- **Aynı gün tuttu:** belge akışı taslağı önce gerçek ekranlar okunarak, sonra ayrı bir doğrulama ajanıyla (147 adım) kuruldu ve ilk gösterimde onaylandı ("harika gözüküyor"). Yayından önce dosyanın tamamı okununca, isimden çıkarılmış bir "she" zamiri de yakalandı.

## 2026-10-05 — Newfork işçi 2 (FB-6.7-AKIS-GUNCEL): yayın reddinin nedeni canlı sayfada geniş bölmeyle arandı
- **Ne oldu:** duyuru akış prototipinin yeni paketi "artifact-pr-review machinery … too large for a review page" ile reddedildi. Neden bilinmediği için sırayla bölündü: dış sayfa, sunucu ve adımlar, stil, soru bloğu, metinler, simgeler, rol. Her varyant aynı adrese yayınlanarak denendi; 8 yayın yapıldı, geçen 4'ü canlı sürüm oldu (3–6). Neden, pakete yeni giren tek modüldü: uygulamanın `ConfirmDialog` bileşeni.
- **Maliyeti:** yaklaşık 25 dakika ve Mert'in canlı sayfasında 4 yarım ara sürüm.
- **Alışkanlık:** bir paket reddedilince önce esbuild'in `metafile` giriş listesiyle eski ve yeni paketi karşılaştır. İlk varyantta yalnız yeni giren modülleri çıkar; metin ve stil ancak bu temiz çıkarsa aranır. Deneme yayınları canlı sürüm olduğu için sayıları baştan küçük tutulur ve raporda adıyla yazılır.

## 2026-10-05 — Newfork işçi (PROTO-X-KARAR): Python yamaları Windows dosyalarının satır sonunu sessizce değiştirdi
- **Ne oldu:** prototip parçalarını `open(..., encoding='utf-8')` ile okuyup `newline=''` ile yazdım; okuma CRLF'yi LF'ye çevirdi, yazma LF bıraktı. Yedekle `diff` bütün dosyayı farklı gösterdi. Git Bash'te `grep -c $'\r$'` iki tarafta da "CR var" dediği için önce yanıldım; `od -c` gerçeği gösterdi.
- **Maliyeti:** yaklaşık 10 dakika ve yedi dosyanın ikinci kez yazılması.
- **Alışkanlık:** başkasının dosyasını yamarken `rb` ile oku, CRLF var mı bak, aynı satır sonuyla `wb` yaz. Yamadan sonra yedekle satır sayısı farkını ölç (`diff | grep -c '^[<>]'`): kastedilenden büyükse önce satır sonuna bak.
- **Tekrar (2026-10-05, PROTO-REF-PACK):** CRLF'li betik dosyasında `node -e` ile çok satırlı metin değiştirme sessizce tutmadı. Doğrulama sanılan `grep -c` başka bir satırı saydı. Important Dates taklidi bu yüzden geçersiz kimlikle bir tur boşa çekildi. Maliyet: ~10 dk ve bir yeniden çekim. Ek alışkanlık: değiştirmenin tuttuğunu, değiştirilen satırın kendisini yazdırarak doğrula.

## 2026-10-05 — Tek denemelik davranış ölçümü yanlış bulgu olarak dışarı gitti (PROTO-REF-PACK)
- **Ne oldu:** "Requests'te fareyle açılan çekmecede odak body'de, Esc kapatmıyor" bulgusunu ara dürtmeyle koordinatöre gönderdim. Bulgu, tek denemeli ve kısa beklemeli (300 ms) bir ölçümden geliyordu. Locations'ta aynı sonuç, hemen önceki Tab ölçümünün odağı bilerek body'ye bırakmasından çıktı. Temiz 3'er denemede iki çekmece de doğru çalıştı. Gerçek tuzaklar ise (Deny sonrası, Delete date sonrası, Jobs discard) 3/3 doğrulandı.
- **Maliyeti:** koordinatöre düzeltme mesajı ve rapor bölümü; eşitleme o bilgiyle başladıysa boşa iş riski.
- **Alışkanlık:** bir davranış bulgusunu (Esc, odak, boş tık) dışarı göndermeden önce taze açılışla, ölçüm araçlarının yan etkisinden (blur, Tab) ayrı ve en az 3 kez, yeterli beklemeyle tekrarla. Ara dürtmede yalnız 3/3 olanı "bulgu" diye yaz.

## 2026-10-05 — Newfork kayıt oturumu: uzun test koşusu LLM ajanına verildi, ajan kullanım sınırında rapor yazamadan durdu
- **Ne oldu:** prototipin bütün test takımlarını (~170 kalem, ~1 saat) bir Sonnet alt ajanına koşturttum. Ajan koşuları bitirdi ama rapor yazarken hesap kullanım sınırına takılıp durdu. Sonuçlar diskte duruyordu; ben "bitti" bildirimi beklediğim için yaklaşık 5 saat kimse bakmadı, Mert "Try again" yazınca fark edildi.
- **Maliyeti:** ~5 saat duran yayın; sonuçları okuyup yeniden koşturmak için ek tur.
- **Alışkanlık:** mekanik, uzun koşuları LLM ajanına değil, sonucu dosyaya yazan düz bir kabuk betiğine ver ve arka planda koştur (`run_in_background`); ajanı yalnız koşuyu tasarlamak ya da sonucu yorumlamak için kullan. Bir ajan hata ile biterse önce diskte bıraktığı çıktılara bak.

## 2026-10-06 — Newfork koordinatör: görsel soru senaryosuz soruldu, Mert üçünü de anlamadı
- **Ne oldu:** Requests görsel turu 2'de üç soruyu (karar veremeyen müdür, yol/dinlenme uyarısı, izin kısaltma satırı) tek cümlelik bağlamla ve karşılaştırma görüntüleriyle sordum. Mert üçüne de "hiç bişe anlamadım … ne nerede kim ne zaman nasıl" yazdı. Ayrıca Deniz'i (takası alan çalışan) müdür diye tanıttım; soruyu kurmadan önce görüntüye bakmamıştım.
- **Maliyeti:** bir soru turu; ikinci turda Mert iki kararı artifact'a (5 varyant) çevirdi.
- **Alışkanlık:** görsel soruyu göndermeden önce görüntüyü kendim aç; her soruda önce dört satır: nerede (ekran → sekme → düğme), kim bakıyor, ne oluyor (isimli örnek, saatle), bugün sorun ne. Seçenekler ancak ondan sonra. Rapordaki iç adı (G1, S7, "IF APPROVED") Mert'in dili sanma.
- **Yine 2026-10-06 ~10:50Z (ikinci kez):** Mert'in zaten seçtiği Sistem 1 için "artifact'taki hâliyle mi girsin, 3 küçük notla mı" diye sordum; Mert "hangisini kastettiğini anlamadım". Sorulacak bir karar yoktu: düzen seçilmişti, notlarım tutarlılık düzeltmesiydi (yazıyla söylenir, sorulmaz). Maliyet: bir soru turu daha. Ek alışkanlık: Mert'in seçtiği şeyi yeniden onaya sunma; soru yalnız yeni ve sonucu değiştiren karar için; soru metni hangi görüntüyü kastettiğini adıyla söylesin ("ilk görseldeki Requests").

## 2026-10-06 — Newfork koordinatör: üç rapor posta kutusunda okunmadan kaldı, biri 🔴
- **Ne oldu:** MVP-RESEND (08:57Z, 🔴 "canlıda hiçbir e-posta çıkmıyor, RESEND_API_KEY yok"), BE-2b API (09:06Z, Mert'e soru O1) ve W-1b (10:47Z) raporları `new/`'de ack'lenmeden durdu; dinleyici yeniden başlatılırken yalnız o anki yeni rapor işlendi, eskiler görünmedi. HANDOFF bile planlamayı "MVP-RESEND sürüyor" diye yazdı. Mert 12:30Z'de "biten işleri live a uygula" deyince fark ettim.
- **Maliyeti:** Mert'in tek başına yapabileceği canlı e-posta adımları ~3,5 saat gecikti; bir soru (O1) sorulmadı.
- **Alışkanlık:** her dinleyici çıkışında yalnız çıktıyı değil `ls .newfork-inbox/new/`'i de oku; ack'lenmemiş eski rapor = işlenmemiş rapor. Devir notu yazmadan önce `new/` boş olmalı.

## 2026-10-06 gece — Newfork koordinatör: Mert'in söylediğini tartmadan uyguladım ("sorgula" kuralı)
- **Ne oldu:** Mert ~15:30Z: "Sana ne desem anında yapıyorsun. Hiç artısını eksisini doğruluğunu faydasını zararını tartmıyorsun. Hiç daha iyi öneride bulunmuyorsun." Gece beş yerde: ağır iş izni kuralını tartmadan kurdum (kilit zaten aynı işi görüyordu, ben darboğaz oldum); "ne zaman?" sorusunu plan değişikliğine çevirdim (EKRAN-03 C1 öne çekildi); CLAUDE.md §4 sırasını sabaha yetişmek için kendim çiğnedim; Mert'in kendi oturumuna RC açmaya çalıştım; 214 salt hata için sabah onay yükünü sınırlamadım. Sonra önerdiğim alternatifi de "(Önerilen)" diye fazla güçlü sundum; Mert "en iyisi mi" diye sorunca gerçek tartıda bu gece için en iyisi olmadığı çıktı (P16'yı atlıyordu).
- **Maliyeti:** Mert'in güveni; bir düzeltme turu; geri alınması gerekebilecek üç plan değişikliği.
- **Alışkanlık:** Mert'in her yeni isteğinde (talimat ya da soru) önce üç satır: (1) doğru anladım mı, soru mu talimat mı; (2) artı/eksi + mevcut kurallarla çakışma (ILKELER, CLAUDE.md, araçlar zaten yapıyor mu); (3) daha iyi/ucuz yol var mı. Ancak sonra uygula ya da öner. "(Önerilen)" yalnız gerçekten tartılmış seçeneğe; zayıf yanını da yaz. Gece/hız baskısı bu adımı atlatma gerekçesi değil.
- **Yine 2026-10-07 ~09:30Z (yeni koordinatör, üçüncü kez):** Mert: "koordinator kardeş hiç sorgulamıyorsun dediklerimizi anında uyguluyorsun. ne tavsiye veriyorsun ne karşı çıkıyorsun ne fikrini sunuyorsun". Bir sabahta 9 yeni hat isteğini, Settings'in artifact üzerinden ayarlanmasını ve alt ajan model kuralını tartmadan karta ve kayda çevirdim; yalnız telefon ve bildirim sökümünün zamanında itiraz ettim. Maliyet: Mert'in güveni; 11 hattın Mert'e getireceği yük önceden söylenmedi. Üçüncü kez görüldüğü için §4.6 gereği CLAUDE.md §3.4'e "her yeni isteğe önce üç satır" kural önerisi olarak Mert'e soruldu (2026-10-07; Mert soruyu kapattı, cevap bekliyor).
- **Yine 2026-10-07 (CLAUDEMD-REWRITE, Mert'in oturumu):** "her gönderim koordinatör izniyle" kuralını ben önerdim, Mert kabul etti; değerlendirmede ağır koşu kilidiyle aynı işi gören çift kapı olduğu görüldü ve geri alındı (§4.9'da yalnız kilit gelene kadar geçiş olarak kaldı). Maliyet: bir öneri-geri alma turu. Alışkanlık genişledi: kendi önerdiğin kuralı da bütün tabloda yeniden tart; kural eklemeden önce aynı amaca hizmet eden mevcut mekanizmayı (kilit, kanca, CI) sor.

## 2026-10-06 — Newfork veri hattı (nf-db): Undo ucu, onu kullanacak hattın önerisi gelince yeniden kuruldu
- **Ne oldu:** EKRAN-01 DB-1c'de sunucu Undo'sunu "ekran hedef revizyonu gönderir" diye tasarlayıp ONAY'a kadar götürdüm (@5c65dc2b). Aynı saatlerde web hattı, ucu kullanacak taraf olarak kendi sözleşme önerisini yazıyordu (adım sunucuda, `undo_depth`); koordinatör onu iletince tasarımı değiştirdim ve ikinci bir R3 inceleme turu gerekti.
- **Maliyeti:** bir yeniden kurma (migration + test baştan), bir ek `nf-guvenlik` turu (~3 dk ajan + ~300 bin token), yaklaşık 40 dakika.
- **Alışkanlık:** başka bir hattın çağıracağı bir uç tasarlarken, kodu yazmadan önce o hatta sözleşme taslağını (girdi / çıktı / hata) tek mesajla sor ya da posta kutusunda önerisi var mı bak; sözleşmeyi tüketen taraf belirlemeden üretici tarafı bitirme.

## 2026-10-06 — Newfork web hattı (nf-backend): SQL'in ilk süzgecini okuyup "tam liste" dedim, döngüdeki ikinci süzgeci kaçırdım
- **Ne oldu:** EKRAN-02 B1a'da açık takasların tarih penceresinden muaf olduğunu `where x.status='open' or …` satırına bakarak ölçtüm, raporda "açık liste tam, A4'ü genişletmeye gerek yok" yazdım. Aynı fonksiyonun döngüsünde pencere dışındaki vakayı atlayan ikinci bir `continue` vardı (BL-839 bunu ayrıca buldu). Hem rapor hem koordinatörün A4 planı yanlış bilgiyle yürüdü.
- **Maliyeti:** B1a kaydının düzeltilmesi, koordinatöre düzeltme mesajı, A4 kapsamının yeniden konuşulması; bir hat yanlış öncülle birkaç saat ilerledi.
- **Alışkanlık:** "bu satırlar dönüyor" iddiasını bir sorgunun ilk WHERE'inden değil, fonksiyonun sonuna kadar okuyarak (döngü içi `continue` / `return` dahil) ya da gerçek bir SELECT'le ölç; ölçemiyorsan raporda "kod okuması, döngü sonuna kadar" diye yaz.

## 2026-10-07 — Newfork Mert'in oturumu (CLAUDEMD-REWRITE): skill çağrısına ek iş eklendi
- **Ne oldu:** Mert `/claude-md-improver` çağırdı; Claude "taslağı birleştirip denetleyeyim" diye ek bir iş varsaydı. Mert: "audit etmeni istemiştim sadece, birleştir demedim".
- **Maliyeti:** bir tur ve güven.
- **Alışkanlık:** skill ya da komut çağrısı görevin kendisidir; yalnız o işi yap. Ek adım gerekiyorsa tek satırla sor.

## 2026-10-07 — Newfork Mert'in oturumu (CLAUDEMD-REWRITE): kurala değer ölçmeden sabitlendi
- **Ne oldu:** telefon ekran görüntüsü genişliği kurala 375 diye yazıldı; uygulama ve bütün QA 390 kullanıyordu. Denetimde yakalandı.
- **Maliyeti:** az; yayından önce düzeltildi. Kaçsaydı QA görüntüleri iki genişlikte üretilecekti.
- **Alışkanlık:** kurala bir değer yazmadan önce bugünkü değeri repoda ara (`grep`); kural mevcut uygulamayı yazar, yeni değer uydurmaz.

## 2026-10-07 — Newfork Mert'in oturumu (CLAUDEMD-REWRITE): iyi giden — 63 karar tek tıklık turlarla kilitlendi, hiçbiri kaybolmadı
- **Ne oldu:** CLAUDE.md yeniden yazımında her bölüm tek tıklık soru turlarıyla kilitlendi; son metin ve karar izleme tablosu (63 karar → satır) uygulamadan önce Mert'e okutuldu.
- **Neden iyi gitti:** karar → satır eşlemesi tablo olarak görünür olunca eksik ya da çifte yazılan karar uygulamadan önce yakalandı.
- **Alışkanlık:** çok kararlı bir belge yeniden yazımında önce karar listesini çıkar, her kararın hangi satıra gittiğini tabloyla göster, sonra yaz.

## 2026-10-07 — Newfork Mert'in tekil oturumu (SCHEMA-SNAP): koruma kâğıt üstünde doğruydu, tetiklenince tutmadı
- **Ne oldu:** inceleme "aynı anda iki `db:schema` birbirini bozar" dedi. İlk düzeltme başlamadan `supabase status` ile bakmaktı. Senaryo gerçekten koşulunca: `status` yalnız veritabanı açık projeyi "çalışmıyor" sayıyor, `db start` "already running"e başarı dönüyor, ikinci üretim birincinin yarım şemasını dosyaya yazdı. Kalıcı çözüm: her koşu benzersiz proje adı. Ayrıca `cmd1 && cd … && (…) &` zincirinin sonundaki `&` bütün zinciri (`cd` dahil) arka plana attı; deneme yanlış klasörde koştu, iki boş girdiyi "aynı" buldu — fazla düzgün sonuç bozuk ölçümdü, elle kontrol yakaladı.
- **Maliyeti:** bir düzeltme yeniden yazıldı, iki ek deneme (~2 dk). Main'e yanlış bir şey girmedi.
- **Alışkanlık:** bir koruma (kilit, "çalışıyor mu" kontrolü, ayırma) "bitti" denmeden önce koruduğu senaryo gerçekten tetiklenerek sınanır. Eşzamanlılık denemesi tek satırlık zincirle değil, betik dosyasıyla kurulur.

## 2026-10-07 — Newfork koordinatör: 107 maddelik kabul listesi Mert'e metin olarak onaya gitti
- **Ne oldu:** Requests'in sahip oturumu EKRAN-PLANI "Bir ekranın turu" 4'e uyup 107 maddelik `EKRAN.md` yazdı; ben dosyayı gönderip "onaylıyor musun" diye sordum. Mert soruları kapattı: "107 maddeyi okumam mümkün değil. bana before after göndermen lazım", sonra "kararlar.md'de yazan ui değişikliklerini uygulamak istiyorum". Görünüm kararları zaten KARARLAR'daydı; onay gereken yeni bir şey yoktu.
- **Maliyeti:** bir soru turu ve oturumun yarım saatlik envanter + önce/sonra sayfası hazırlığının bir kısmı (sayfa yarıda bırakıldı).
- **Alışkanlık:** Mert'e liste değil, ekran götür: görünen değişiklik önce/sonra görüntüsüyle, görünmeyen en çok birkaç cümlelik isimli örnekle. KARARLAR'da zaten kararı olan şeyi yeniden onaya sunma; onay yalnız yeni karara. Kural metniyle ("Mert listeyi tek turda onaylar") Mert'in okuyabileceği şey çelişirse kuralı uygulamadan önce biçimini sor.

## 2026-10-07 — Newfork koordinatör: görünür değişikliği "telefon sonra" diye göndermeyi önerdim, Mert önce telefonu istedi
- **Ne oldu:** Requests tek tablonun masaüstü hâli hazırdı, telefonda tablo yana taşıyordu ve bir sekme ekran dışındaydı. "Gönder, telefon sıradaki iş (Önerilen)" dedim (dayanak P01, P15). Mert "Önce telefon düzelsin"i seçti.
- **Maliyeti:** bir soru turu; önerinin tutmaması (kabul oranı).
- **Alışkanlık:** Mert'in gördüğü bir ekran değişikliği yarım (bir cihazda bozuk) gitmez; §2.C "işin çekirdeğinde tam çözüm > ucuz kestirme" hız ilkelerinden önce gelir. Önce/sonra görüntüsünü göndermeden telefon görüntüsüne de bak; bozuksa soruyu sormadan düzelttir, sonra götür.

## 2026-10-07 gece — Newfork koordinatör: canlı migration iznini kural dosyasının bir maddesine bakıp verdim, öbür maddeyi okumadım
- **Ne oldu:** gece modunda dört oturuma "canlı migration için gönder bende, gece de geçerli" dedim (§5.1). §5.3 canlı (hosted) işlem için Mert'in "evet"inin işi yapan oturumun penceresine yazılmasını istiyor; ACIL-40001 oturumu fark etti ve gece canlıya dokunmadı.
- **Maliyeti:** dört oturuma düzeltme mesajı; canlı işlemler sabaha kaldı. Oturum fark etmeseydi kural ihlaliyle canlıya değişiklik çıkacaktı.
- **Alışkanlık:** bir yetkiyi kullanmadan önce kural dosyasında o yetkiyi sınırlayan başka bir madde var mı ara (`grep -n "canlı"`); iki madde çelişiyorsa katı olanla yürü ve Mert'e sor.

## 2026-10-08 — Newfork koordinatör: kilidi tutan oturum takıldı, 6,5 saat kimse fark etmedi
- **Ne oldu:** BL-965 oturumu `main.lock`'u aldı, canlı doğrulamada izin engeline takıldı. Mert'e "devam et yaz" dedim, sonrasını izlemedim. Oturum bir sonraki adımda (git okuması) yine takıldı. Uygulama yeniden başlayınca benim bekleyicim de durdu; EKRAN-01'in uyarı mesajı bana ulaşmadı.
- **Maliyeti:** main 8 saat yeni commit almadı; canlıda 6 değişiklik main'in önünde kaldı; hazır Schedule paketi saatlerce bekledi.
- **Alışkanlık:** kilit tutan oturumu iş bitene kadar her turda `lock.mjs status` + `list_events` ile kontrol et; izin engelinin kökünü (izin modu) ilk seferde çöz, kullanıcıya "devam et" yazdırıp bırakma. Kalıcı çözüm: tren (OPS-08), kilit yalnız push anında.

