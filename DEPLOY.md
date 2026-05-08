# csnl-ops deployment

## Phase A — first-time apply

Pre-reqs: Supabase CLI installed (`brew install supabase/tap/supabase`),
authenticated (`supabase login`), Mac with `/Volumes/CSNL_new-2` mounted.

```bash
cd /Users/csnl/Documents/claude/csnl-ops

# 1. Link to the shared Supabase project (same as lab-reservation).
supabase link --project-ref qjhzjqkrbvsnwlbpilio

# 2. Inspect the diff. Should show *only* csnl_ops.* changes.
supabase db push --dry-run

# 3. Apply for real after eyeballing the diff.
supabase db push

# 4. Verify.
psql "$DATABASE_URL" -f scripts/verify-csnl-ops-schema.sql
# Expected: 8 researchers, 2 grants, 15 projects, all enums + tables present,
# zero collisions in public schema.
```

**Rollback** (if something goes sideways):

```sql
drop schema csnl_ops cascade;
```

`public.*` is untouched — lab-reservation continues to work.

## Decisions captured during Phase A

### Same Supabase instance, schema isolation

csnl-ops and lab-reservation share `qjhzjqkrbvsnwlbpilio`. Schema isolation
is the only barrier — every csnl-ops migration must start with
`set search_path = csnl_ops;` and reference no `public.*` table.

CI grep block (to be added to `.github/workflows/`): refuse PRs that
contain `public.` in `supabase/migrations/*.sql`.

### Borrowed `SUPABASE_SERVICE_ROLE_KEY`

Same instance ⇒ same key works. Borrowing reduces operational overhead
(one key to rotate, one to leak-monitor). The trade-off is blast radius:
a leak from csnl-ops's deploy logs exposes lab-reservation's
RLS-bypass too.

**Mint separate key the moment** csnl-ops:
- Acquires a webhook callable from a third party.
- Adds a public-facing API where the key could surface in error responses.
- Has more than 2 active deployments (preview branches included).

Until then, the operational simplicity outweighs the marginal blast risk.

### Separate `CRON_SECRET`

csnl-ops gets its own `CRON_SECRET` (32-hex). Generated with
`openssl rand -hex 32`. **Not shared with lab-reservation.**

Rationale: a leak of one cron secret only allows replaying that repo's
endpoints. Combined with the borrowed service-role key, this still leaves
some exposure (the leaked endpoint could trigger DB writes), but the
blast is bounded to the csnl_ops schema.

### Shared Gmail SMTP credentials

`GMAIL_USER=vnilab@gmail.com` and `GMAIL_APP_PASSWORD` are shared with
lab-reservation. Rotation cascades to both apps — call out in commit
message body when rotating either side.

Future: dedicated `csnl-ops@vnilab.work` Google Workspace alias if
chase-logic email volume grows enough to be a separate sending identity.

## Subsequent migration phases

Phase B (`20260505*`) and onward follow the same drill:

```bash
supabase db push --dry-run    # always
supabase db push              # after eyeballing
psql "$DATABASE_URL" -f scripts/verify-<phase>.sql
```

The user runs `db push` manually for the first time of each phase. Claude
proposes; the human pulls the trigger.
