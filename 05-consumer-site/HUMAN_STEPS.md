# Human steps for 05-consumer-site

1. **Images.** The brief asks for real, credited photography (Wikimedia Commons, Unsplash or Pexels; Kharagpur/Medinipur paddy fields and potato harvest). None is used yet; the pages are type-only. Pick photos, convert to WebP, add them under `public/img/`, and list each in `docs/IMAGE_CREDITS.md` and a `/credits` page.
2. **Bengali review.** Every string in `src/i18n/bn.json` carries `"_review": true` until a native Bengali speaker has read it. Check the wording of the three checks and the "Verify it yourself" text in particular.
3. **Vercel.** Project name `fposetu-consumer`, root directory `05-consumer-site`. Env vars (Production and Preview): `NEXT_PUBLIC_DATA_SOURCE=live`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_READ_API_URL` (values in `00-core-ledger/docs/RUNBOOK.md` section 0), `NEXT_PUBLIC_URL_GOV`. No CORS entry is needed for this site: the provenance fetch runs on the server.
4. **QR labels.** Point the label generator at `{NEXT_PUBLIC_URL_CONSUMER}/00/{sscc}`.
5. **Playwright on WSL without root.** If Chromium says `libnspr4.so: cannot open shared object file`, see `../06-gov-dashboard/docs/TESTING.md` (download the .debs and set `LD_LIBRARY_PATH`).
