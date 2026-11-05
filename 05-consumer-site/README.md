# 05-consumer-site

The public page a pack's QR code opens: where this lot was grown, how it was handled, and the ledger entries behind it. No login. No farmer name or phone is ever shown.

- `/` explains the page and takes a manual 18-digit lot number.
- `/00/{sscc}` is the GS1 Digital Link target. It shows commodity and variety, village and block, harvest date, grade, three checks (residue tested, safe-to-harvest interval, cold chain) with a "how we know" expander, the journey, and "Verify it yourself" with each ledger entry linked to the Gov explorer.
- English and Bengali via `?lang=bn`. Bengali is unreviewed (`_review`).

Data comes from `GET /public/provenance/{sscc}` through the gateway, falling back to the read-only API (a quiet "Showing the last verified record" note appears then).

```
pnpm install
pnpm mock      # terminal 1
pnpm dev       # terminal 2, http://localhost:3005/00/089012340000004517
pnpm check     # typecheck + unit tests
pnpm test:e2e  # Playwright
```

Deployment settings and open steps: `HUMAN_STEPS.md`. Contract gaps: `CONTRACT_REQUESTS.md`. Screenshots: `docs/screenshots/`.
