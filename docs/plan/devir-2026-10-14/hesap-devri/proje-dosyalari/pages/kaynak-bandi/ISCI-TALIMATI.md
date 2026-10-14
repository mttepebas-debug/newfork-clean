# Adding the source band to one Artifact (worker steps)

For each artifact id you are given, do these steps in order. Never print or quote page HTML in your answer.

1. Full read, so the live version counts as viewed: Artifact tool, action "read", url "https://claude.ai/artifact/<id>" (no `path`). If the result says the HTML was saved to a file, do NOT Read that file.
2. Fresh copy to disk: Artifact tool, action "read", url as above, path "index.html", out_dir "<SCRATCH>/live/<id>".
3. Add the band: Bash `python3 /mnt/project-files/pages/kaynak-bandi/bant.py <SCRATCH>/live/<id>/index.html <id>`. It must print "band: <id> ...". Then check: `grep -c 'nf-kaynak-bandi:start' <file>` prints 1.
4. Publish: Artifact tool, publish, url "https://claude.ai/artifact/<id>", file_path "<SCRATCH>/live/<id>/index.html", label "Kaynak bandı". Do not pass icon, title, files or capabilities.
5. If the publish is refused because the live version is newer, repeat steps 2–4 once (the refusal counts as the read). If it is refused saying identical content was already refused against the same version, and you built the file from that same version in step 2, publish it again unchanged once.
6. Never delete an artifact, never publish without `url`, never touch any file other than your own copies under <SCRATCH>/live/<id>/.

Report, one line per id: `<id> | published vN` or `<id> | FAILED: <short reason>`.
