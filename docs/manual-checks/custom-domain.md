# Custom Domain Check (FDN-04)

**Checked:** 2026-09-15

**Requirement:** `https://games.rogerflores.dev` resolves over TLS to the
deployed room-creation screen.

## DNS record

| Field | Value |
|---|---|
| DNS host for `rogerflores.dev` | Cloudflare (nameservers `mona.ns.cloudflare.com`, `yoxall.ns.cloudflare.com`) |
| Type | `CNAME` |
| Name | `games` |
| Target | `2dd48b707c982d85.vercel-dns-017.com` (the value Vercel's Domains page assigned) |
| Proxy status | DNS only (grey cloud) |
| Vercel project | `games-web` |

The name resolves to Vercel's addresses (`64.29.17.65`, `216.198.79.65`), not
Cloudflare proxy addresses, which confirms the record is DNS only. Cloudflare's
orange-cloud proxy would stop Vercel from issuing a certificate and tends to
cause redirect loops.

## Observed result

- **Domain went valid:** 2026-09-15. The name was observed resolving on that date.
- **TLS issuer:** Let's Encrypt, `CN=YR2` (certificate verified; `curl` `ssl_verify_result=0`).
- **Content:** `https://games.rogerflores.dev` returns HTTP 200 and serves the
  "Create room" screen.

## Trust root

Control of the `rogerflores.dev` DNS zone in Cloudflare is control of the whole
product's entry point (threat T-1-29). No control in this repo can mitigate
that; account hygiene on the Cloudflare account is the control.

**Re-check when:** the domain's DNS moves off Cloudflare or changes registrar;
the Vercel project is recreated or renamed (its CNAME target may change); the
record is switched to proxied; or the certificate issuer changes unexpectedly.
