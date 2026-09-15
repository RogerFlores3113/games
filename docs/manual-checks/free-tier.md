# Free-Tier Check (FDN-03)

**Checked:** 2026-09-15

**Requirement:** no service in the stack requires a paid plan or a stored
payment method to stay reachable (`.planning/PROJECT.md` § Constraints). This
is about plan terms, not about whether we have been charged.

## Cloudflare (Worker + Durable Objects)

- **Plan as the dashboard words it:** "Free", $0, "For personal use and simple
  applications", marked "Current plan".
- **Limits shown on the plan page:**

| Product | Limit | Value |
|---|---|---|
| Workers | Requests | 100,000 / day |
| Workers | CPU Time | 10 ms / request |
| Workers | CPU time (max per invocation) | 10 ms |
| Workers | Subrequests per request | 50 |
| Workers | Number of Workers | 100 |
| Workers | Cron Triggers per account | 5 |
| Durable Objects | Requests | 100,000 / day |
| Durable Objects | Duration | 13,000 GB-s / day |
| Durable Objects | SQL Rows Read | 5,000,000 / day |
| Durable Objects | SQL Rows Written | 100,000 / day |
| Durable Objects | SQL Stored Data | 5 GB |

- **Payment method stored:** No
- **Trial countdown / grace period / suspension notice:** None shown

## Vercel (Next.js app)

- **Plan as the dashboard words it:** "Hobby" (the team "Roger Flores' projects"
  shows the Hobby badge).
- **Payment method stored:** No
- **Trial countdown / grace period / suspension notice:** None shown

## Pausing on inactivity

The failure that disqualified Supabase was a free tier that **pauses** after
about a week idle, not one that bills. Neither plan page above shows an
inactivity pause. Whether a deployed Durable Object actually serves a cold
click after a week idle is evidence only the RT-02 check produces; see
`docs/manual-checks/cold-start.md`.

## Result

**PASS.** Both services are on free plans ("Free" and "Hobby"), neither has a
payment method stored, and neither dashboard shows a trial countdown, grace
period, or suspension notice. The stack stays reachable without a paid plan.

**Re-check when:** either plan changes; a new service is added to the stack;
Cloudflare or Vercel changes its free-plan terms; or a free-tier limit above
is hit in real use (for example, Durable Object requests exceeding 100,000/day).
