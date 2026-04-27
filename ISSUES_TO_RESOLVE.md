# Items before v2.6.0 PR is ready

Punch list to clear before merging to `main`. Update as work lands.

## 1. Sidebar restructure and lock-ins

- [x] SDK introduction migration — `5cc2b21c`
- [x] Home tab sidebar restructure — `5cc2b21c`
- [x] Runtime section polish — `3b11607a`
- [x] Demo OS polish — `8aa9edeb`
- [x] Dash tutorial polish — `75cd7fd6`
- [x] Coda tutorial polish — `7f9814b0`
- [x] Blank Canvas pages — `f7f71392`
- [x] Homepage opener refinement — `930085b0`
- [x] Scout tutorial tightening — `1c9d0807`

## 2. Cleanup

- [x] Drop `_legacy/production/*` and `TBD/2_6_remove/` orphans (46 files) — `7a6cc9b4`
- [x] Refresh `connect-agent-os-ui` snippet — `07123216`
- [x] Add `agentos-api-scroll` demo video — `43baf92a`

## 3. Open

- [ ] `first-agent.mdx` references missing `/videos/agentos-connect-workbench.mp4` and `/videos/agentos-chat-workbench.mp4` — add files or remove embeds.

## 4. Pre-existing dead links (out of scope, not blocking)

Sit in `deploy/*`, not introduced by this branch.

| File | Dead target |
|------|-------------|
| `deploy/interfaces/{slack,discord,whatsapp,telegram}/overview.mdx` | `/production/templates/overview` (×7) |
| `deploy/introduction.mdx` | `/production/applications/{text-to-sql,research-agent,knowledge-agent}` and `/production/applications` |
