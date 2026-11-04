# 06 Governance dashboard and Ledger Explorer

Academic prototype, RD61003, CRDIST, IIT Kharagpur, Group 7. Next.js 16, TypeScript strict, Tailwind 4. Vercel project name: `fposetu-gov` (not deployed yet).

**Built (P0 to P3 against the mock):** public `/ledger` (channel selector, live block list, search by tx ID, SSCC, e-NWR or order ID), `/ledger/tx/[txId]`, `/ledger/block/[channel]/[n]`; signed-in `/` (KPI cards and the Month-12 gate), `/network`, `/lots/[sscc]`; `/login`.
**Not built:** `/villages`, `/prices`, `/patronage`, `/finance`, `/integrity`, `/compliance`, `/pilot`, `/about`, `/credits`, the proof drawer, activity toasts and demo bar. See the report and `CONTRACT_REQUESTS.md`.

```
pnpm install
pnpm mock          # terminal 1, :4010
pnpm dev           # terminal 2, :3006
```
Demo logins (password `Setu@2026`): `observer.gov` (district observer), `board.fpo` (FPO board). Explorer pages need no login.

See `CLAUDE.md` (commands, folders, never-do list), `docs/TESTING.md`, `HUMAN_STEPS.md`.
