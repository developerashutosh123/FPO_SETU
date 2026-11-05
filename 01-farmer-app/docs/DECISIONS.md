# Decisions: 01-farmer-app

Dates are DD-MM-YYYY. Newest last.

**D1 (05-11-2026) Expo SDK 58, web build only.** SDK 58 is the `latest` tag of `expo` on npm today (expo 58.0.23, react-native 0.88.1, react 19.3.0); `npx expo install --check` reports every dependency aligned. PROMPT.md asks to pin the SDK that the *store* build of Expo Go supports. That matters only for the Expo Go and APK builds, which are out of scope here, and it was not verified. **Before any Expo Go / EAS work, re-check expo.dev/go and, if the store build is older, downgrade the SDK.**

**D2 Single-page web output, not static.** `web.output: "single"`. A static export would render every route in Node at build time, where the session in localStorage does not exist, and invites hydration mismatches. The cost: `app/+html.tsx` is ignored in this mode, so the document shell (fonts, language, background) is `public/index.html`. `vercel.json` rewrites everything to `/index.html` so `/lot/{sscc}` and `/statement/{sscc}` work as inbound links.

**D3 Hoisted install.** `nodeLinker: hoisted` in `pnpm-workspace.yaml`; Metro does not follow pnpm's symlinked layout reliably. `allowBuilds` approves only `esbuild` (vitest). Verified: `CI=1 pnpm install --frozen-lockfile` into an empty store, from a copy of the folder alone, exits 0 with no `ERR_PNPM_IGNORED_BUILDS`. Add a package with a build script and that command fails until it is listed.

**D4 Device key = non-extractable WebCrypto ECDSA P-256 in IndexedDB** (PROMPT.md platform decision 3, web branch). One key per signed-in farmer. The private key cannot be read back, even by the page. Needs a secure context (https or localhost); on plain http the app says so (`device.failed`) instead of failing silently. Wire formats are the contract's: 130 hex public key (04||X||Y), 128 hex signature (r||s). `payloadToSign` is signed as received; before signing, `checkDraftPayload` refuses a payload that is not canonical or whose fields differ from the draft on screen.

**D5 Key registration.** On first sign-in on a phone the app generates the key and calls `POST /farmers/me/device-key`. It is retried when the farmer confirms a lot (`ensureRegistered`), and "register this phone's signature again" is offered on `ERR_BAD_FARMER_SIGNATURE`. Unknown until the live gateway (P5): whether re-registering a key that is already on the ledger is accepted.

**D6 `ngrok-skip-browser-warning` on every `fetch` to an ngrok host, SSE read with `fetch()` + a stream reader** (RUNBOOK section 3, fixes 1 and 2). Unit-tested for the header rule and the SSE parser.

**D7 Probe and failover** follow PORTAL_COMMON section B exactly: `/health` 8 s, one retry, only then `EXPO_PUBLIC_READ_API_URL` and index-only; a failed request re-probes first. In index-only or offline mode the banner shows and write buttons are disabled with the reason on screen.

**D8 Home list without `GET /lots`.** Members are not allowed to list lots (CONTRACT_REQUESTS.md item 1). Home shows drafts waiting for a signature plus lots that have a statement. Not a complete "my lots" until the contract changes.

**D9 "This is not right" writes nothing.** No reject endpoint exists (CONTRACT_REQUESTS.md item 2). It is local to the phone and says so.

**D10 Timeline from the passport, proofs from the transactions.** Steps exist only if the passport shows them (quality, storage, lien, order, custody, statement). Times and proof chips come from `GET /ledger/tx/:id` matched by chaincode function (`commissionLot`, `attestQuality`, `recordDeposit`, `markLien`, `releaseLien`, `agreePrice` (last), `proposeTransfer`, `acceptTransfer`, `distributePatronage`). If a tx cannot be fetched the step shows without a chip. Nothing is guessed.

**D11 Read aloud.** Every amount is spoken in words (Bengali and English are spelled out in the Indian system; Hindi uses grouped numerals, which the engine reads correctly). Lines are spoken one by one and the matching row is highlighted. Voices are read from `speechSynthesis.getVoices()` AFTER `voiceschanged` (browsers load them asynchronously; an early read wrongly concluded "no Bengali voice"), with a polling safety net and a 3 s limit (`src/lib/voices.ts`). expo-speech's own web voice list is not used: it never resolves on a device with no voices. Preference: bn-IN, bn-BD, any Bengali. No Bengali (or Hindi) voice: the English statement is read with an English voice (en-IN, en-GB, en-US, any) and a note says so; the on-screen text stays in the app language. No voice at all: the screen says so and keeps the text. Number-word table and all Bengali strings need review by a native speaker (`_review`).

**D12 No photographs in this build.** PORTAL_COMMON P4 asks for real West Bengal photos for empty states; not done here. Empty states are text and layout only. `/credits` says so.

**D13 Money and dates.** `formatINR` and `formatDateIST` from the contract. Plain `YYYY-MM-DD` values from the API are reformatted as text, never through `Date`, so no timezone shift. Money is Latin numerals in bold tabular figures in every language.

**D14 Toasts.** Events carry no farmer identity, so the app toasts only for SSCCs it has loaded for this farmer, ignores the first 2 s of a new connection (replayed history), and de-duplicates by tx.
