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

## Tests

`e2e/inbox.spec.ts` runs against a second build made with `.env.inbox` (a pretend address,
`https://inbox.example.test`, answered by the tests themselves). `npm run test:e2e` builds and runs it
with the normal site tests. The real project is never contacted by a test.
