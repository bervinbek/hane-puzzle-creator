# Class inbox (M16, D-049)

Where each class's puzzles go when a student presses **Download and send**. The site stays on GitHub Pages; the files live in a free Supabase project.

## What is public and what is secret

| Value                       | Public?                  | Where it lives                                                           |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Project URL                 | Yes                      | Pages build variable `VITE_INBOX_URL`                                    |
| Public (`anon`) key         | Yes, by design           | Pages build variable `VITE_INBOX_KEY`                                    |
| Delete passcode             | **Secret**               | A Supabase secret, typed in their dashboard. Never in the repo or docs.  |
| `service_role` / secret key | **Secret, full control** | Only inside Supabase (Edge Functions already have it). Never copy it out |
| Database password           | **Secret**               | Your password manager                                                    |

The repository and the published site are public, so anything written in them can be read by anyone.

## Set up (once)

1. Supabase dashboard, **SQL Editor**, **New query**. Paste all of `supabase.sql`, press **Run**. It can be run again safely.
2. Check **Storage**: a private bucket called `puzzles` should exist.
3. GitHub repo, **Settings, Secrets and variables, Actions, Variables**: add `VITE_INBOX_URL` and `VITE_INBOX_KEY` (the project URL and the public key).
4. For local testing, put the same two lines in `.env.local` (already ignored by git).

With neither variable set (local dev, forks) the Download dialog has no class code field and nothing is ever sent.

## Rules enforced by the database

- Anonymous visitors can only add files at `<folder>/<name>.stl|png|json`, folder `a-z 0-9 _ -` up to 24 characters.
- The bucket is private and has a size cap and allowed file types.
- No public listing, reading, overwriting or deleting.

## The inbox page and its delete function (M16e)

The page is `inbox.html` on the site (for example `https://<you>.github.io/<repo>/inbox.html`). It is linked from nowhere, so keep the address to teachers. Anyone who has it can look at and download every class's puzzles. Deleting needs the passcode.

Set up once, after the steps above:

1. Supabase dashboard, **Edge Functions, Deploy a new function**. Name it exactly `inbox-admin`. Paste all of `inbox/functions/inbox-admin/index.ts` into the editor and **Deploy**.
2. **Edge Functions, Secrets**: add `INBOX_PASSCODE`. Use a phrase of at least 8 characters (longer is much safer; anything shorter switches deleting off). Type it only in their dashboard, never in the repo, a chat or a commit. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there for every function; do not copy the service key anywhere.
3. If the page says it cannot reach the inbox and the browser console mentions the JWT or a 401 before any passcode is asked: the function's **Verify JWT** setting rejects the newer `sb_publishable_` keys. Turn that setting off for this function (listing and links are open anyway, and the passcode is what guards delete). The older `anon` key works with it on.
4. The function uses the `inbox_attempts` table that `supabase.sql` creates; run that file again if you have not since 16e was added.

How deleting is guarded: the passcode is compared on the server; five wrong tries in 15 minutes lock deleting for everyone until the oldest of them is 15 minutes old (the page says how long); the class name must be typed and the file count shown must still be right. This means anyone who types five wrong guesses can lock you out for up to 15 minutes. That is the price of the guard.

## Tests

`e2e/inbox.spec.ts` runs against a second build made with `.env.inbox` (a pretend address,
`https://inbox.example.test`, answered by the tests themselves). `npm run test:e2e` builds and runs it
with the normal site tests. The real project is never contacted by a test.
`tests/inboxAdmin.test.ts` runs the real function code in Node against a pretend storage, and `e2e/inbox-page.spec.ts` runs the page against a pretend function. The only part no test runs is the `Deno.serve` start-up at the end of `index.ts`, so check it once for real (todo 16f).
