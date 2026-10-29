# Lessons Learned

Review at the start of each session. After any correction from the user, add an entry: what went wrong, the rule that prevents it.

Format:

```
## YYYY-MM-DD: short title
- Mistake: ...
- Rule: ...
```

_No lessons yet._

- Editing tasks/todo.md by script: bound the edit to the one slice (from its heading to the next heading), never to a far-away marker. A "tick everything up to M9" replace ticked the user's newly added 11c to 11f before they were built. Re-read the file just before editing, since the user adds to it while we work, and check the diff of todo.md before committing.
- It happened again (2026-10-30): the M14 edit ran to "## M9", past M15 added after it, ticked M15 and put M14's review under it. The end of a section is the next heading of the same or a higher level (`re.search(r"^#{2,3} ", ...)` after the start), never a named heading that happens to come later. After any todo.md edit, list the `[x]` lines of the sections next to it.
