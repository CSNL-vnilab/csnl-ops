<!-- BEGIN:multi-session-rules -->
# Multi-session collaboration rules

Multiple Claude sessions work on this repo concurrently — same convention as
the sibling `lab-reservation/` repo. Treat the working tree as shared
infrastructure:

1. **Before pushing, `git fetch && git log HEAD..origin/main`.** Pull
   first if remote moved. Force-push to `main` is forbidden.

2. **Production-affecting commits** (anything under `src/app/`, `src/lib/`,
   `supabase/migrations/`, `.github/workflows/`) deserve a 60-second pause
   after `git push`: Vercel concurrency cancels in-flight builds when a new
   push lands.

3. **DB-mutating scripts** (`scripts/walk-*.mjs`, `scripts/resolve-*.mjs`,
   anything that writes Supabase rows) state the action explicitly in the
   commit message body so other sessions can spot the change in `git log`.

4. **Long-running NAS walks** (`scripts/walk-grm-presenters.mjs`,
   `scripts/walk-memory-projects.mjs`, `scripts/walk-grant-finals.mjs`):
   - Check `ps -axo pid,etime,command | grep "scripts/walk-"` before
     starting — SMB IO is slow and another session may have a walk in
     flight against the same `/Volumes/CSNL_new-2`.
   - These walkers emit `.sql` follow-up migrations. Do **not** commit the
     emitted migration until a human reviews the diff.

5. **Cron** runs as GitHub Actions → csnl-ops Vercel endpoint
   (mirrors lab-reservation's pattern). `vercel.json` is intentionally
   minimal (Vercel Hobby cron limit). Each new endpoint gets a workflow
   under `.github/workflows/csnl-*.yml`.
<!-- END:multi-session-rules -->

<!-- BEGIN:cross-repo-rules -->
# Cross-repo coordination with lab-reservation

csnl-ops shares the **same Supabase instance** with `lab-reservation/`
(project ref `qjhzjqkrbvsnwlbpilio`). Schemas are isolated:

- `public.*` = lab-reservation's domain. **Never touched by csnl-ops.**
- `csnl_ops.*` = csnl-ops's domain.

Hard rules to prevent blast radius:

1. **No `public.` references** in `csnl-ops/supabase/migrations/*.sql`.
   Every migration begins with `set search_path = csnl_ops;` (or fully
   qualifies with `csnl_ops.`).
2. **Service-role key is currently borrowed from lab-reservation.**
   Mint a separate key the moment csnl-ops gains a webhook needing
   independent rotation. See `DEPLOY.md`.
3. **`CRON_SECRET` is csnl-ops-only** — separate from lab-reservation's
   so a leak in one doesn't compromise the other.
4. **Gmail SMTP credentials are shared** (`vnilab@gmail.com`,
   `GMAIL_APP_PASSWORD`). Document any rotation in both repos'
   commit history.
<!-- END:cross-repo-rules -->

<!-- BEGIN:nas-rules -->
# NAS-bound work runs locally only

Vercel functions and GitHub Actions runners cannot reach
`/Volumes/CSNL_new-2`. Work that touches the NAS must:

- Live under `scripts/` (not `src/app/api/`).
- Assert `existsSync('/Volumes/CSNL_new-2/Memory')` before any IO and
  exit with code 2 if missing.
- Be runnable from the user's Mac with the SMB mount, not from CI.

Phase B walkers and Phase D `resolve-mm-slides.mjs` follow this rule.
<!-- END:nas-rules -->
