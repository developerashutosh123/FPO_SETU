# Prompt 01: Farmer App (Expo / React Native, Bengali-first) + VLE Mode

> Kickoff: `cd 01-farmer-app`, then `claude --add-dir ../shared`, then send:
> `Read ../shared/CONTRACT.md, ../shared/PORTAL_COMMON.md, ../shared/contract.ts and this PROMPT.md fully. Start Phase P0. Stop at every CHECKPOINT.`
> **Prerequisite:** the 00-core-ledger chat has finished Phase C1.
> This chat can run on your Windows PC (it needs Node 22 + Git only) or in the Codespace.

## Your role
You build the **only mobile surface** of FPO-SETU. It answers one question for the farmer: **"What happened to my lot, and what was I paid?"** It also has a **VLE mode** for the Village-Level Entrepreneur who onboards farmers and creates lot drafts.

The farmer's device key is what makes dual attestation (F2) real. That makes this app part of the blockchain design, not just a viewer.

## Platform decisions (verify each against current Expo docs via Context7 before scaffolding)
1. **Pin the Expo SDK to the version the *store* build of Expo Go supports today.** As of May 2026 that was SDK 54, and newer SDKs had App Store delays. Check `expo.dev/go` and the Play Store listing, then scaffold with `npx create-expo-app@latest --template default@sdk-XX`. Record the choice in `docs/DECISIONS.md`. A wrong SDK means the professor's phone shows "Project is incompatible with this version of Expo Go".
2. **Use only modules bundled in Expo Go.** No custom native code:
   - `expo-router`, `expo-sqlite`, `expo-secure-store`, `expo-crypto`, `expo-speech`, `expo-camera`, `expo-location`, `expo-localization`, `react-native-svg`;
   - pure-JS libraries: `@noble/curves` (p256 ECDSA) + `@noble/hashes`, `i18next` + `react-i18next`, `react-native-qrcode-svg`.
   - Polyfill `crypto.getRandomValues` with `expo-crypto`.
   - Do **not** use `react-native-maps`: a standalone APK would need a Google Maps key. Draw plot polygons as SVG instead.
3. **Ship three ways** (Phase P6):
   - **Expo Go via EAS Update** (channel `preview`). The QR opens the app with no laptop running.
   - **Android APK** via `eas build -p android --profile preview` (`buildType: "apk"`, internal distribution). The free plan allows 15 Android builds a month, so test locally first.
   - **Web build** via `npx expo export -p web`, deployed to Vercel as `farmer-web`, shown inside a phone frame on desktop. On web:
     - Storage: use the `expo-sqlite` web support if it is stable in the pinned SDK; otherwise use an IndexedDB adapter behind the same interface.
     - Keys: replace `expo-secure-store` with a non-extractable WebCrypto key in IndexedDB.
     - Label the web build "Web demo".
   - iOS standalone is out of scope (it needs a paid Apple account). iPhones use Expo Go or the web build.

## Screens: farmer mode (Bengali default; Hindi and English switchable)
1. **Language picker** on first launch. Large tiles: বাংলা / हिन्दी / English.
2. **Login:** phone → demo OTP (`123456`, shown on screen as "Demo OTP").
3. **Consent:**
   - Plain-language Bengali notice (purpose, what goes on the ledger, what never does, how to erase).
   - A **"শুনুন" (Listen)** button that reads it aloud with `expo-speech` (`bn-IN`; if the device has no Bengali voice, say so and keep the text).
   - An explicit checkbox.
   - The consent hash is registered via F1 when the VLE onboards the farmer. If the farmer installs the app later, it calls `POST /farmers/me/device-key`.
4. **Device key:** on first login, generate an ECDSA P-256 keypair, store the private key in `expo-secure-store`, and register the public key. Show "এই ফোনটি আপনার স্বাক্ষর" (this phone is your signature) with a short explanation.
5. **Home: my lots.**
   - Lot cards show: commodity icon + Bengali name, status chip, grade, kg, and **net credit in large bold ₹** when settled.
   - A "Waiting for your confirmation" card appears at the top when `GET /lots/drafts/pending` has items.
   - A season summary sits at the top: total kg, total paid, and pending.
6. **Confirm lot (F2):**
   - Shows the draft in plain words: crop, bags, estimated weight, date, VLE name.
   - A big button **"আমি নিশ্চিত করছি"** (I confirm). Pressing it signs `payloadToSign` **exactly as received** (it is already canonical JSON) with the device key and calls `POST /lots/:sscc/farmer-sign`.
   - On success: a receipt with the tx ID and a "Proof" sheet.
   - On `ERR_BAD_FARMER_SIGNATURE`: an action-phrased message.
   - Also add a **"এটা ঠিক নয়"** (This is not right) button that rejects the draft.
7. **Lot detail:**
   - A vertical timeline of events (commissioned, graded, stored, pledged, sold, delivered, paid), each with a proof chip and the place.
   - The QR of the consumer link.
   - "Pledged to bank" in plain words when `lien.status=ACTIVE`.
8. **Payment statement (≤ 2 taps from home)** (`GET /statements/me`):
   - gross;
   - each deduction on its own line with its Bengali name (hamali, market fee, commission, transport, cold storage rent, FPO margin, loan recovery);
   - **net paid**;
   - the UPI ref (labelled simulated) and the paid date;
   - a **"পড়ে শোনান"** (Read aloud) button that speaks the statement in Bengali, numbers included (₹ amounts in words).

   This is the most important screen in the project. Polish it the most.
9. **Crop diary:**
   - Log a spray or fertiliser by picking from a short list of common products, with `phiDays` per product. Research the PHI values from labels/CIB&RC and cite them in `docs/DATA_SOURCES.md`.
   - Show a PHI warning if the expected harvest or unload date falls inside the window.
   - Entries queue offline.
10. **Prices:** today's modal price for the farmer's crops at Medinipur (West) and nearby markets vs the 30-day trend, from `GET /prices`; paddy vs MSP. Use neutral wording ("Today's mandi price", not advice). Show the data date and source.
11. **Profile:**
    - member token (not the phone number), FPO name, village;
    - language switch;
    - "My data on the ledger" explainer;
    - **"আমার ব্যক্তিগত তথ্য মুছুন"** (Erase my personal data): confirm twice → `DELETE /farmers/:id/personal-data` → shows the resulting state.

## Screens: VLE mode (role `vle`; switch after login as `subhankar.vle`)
- **Onboard farmer (F1):**
  - Details form in Bengali.
  - **Walk-the-boundary plot capture:** `expo-location` points every few metres, closed into a polygon drawn as SVG, with the area computed in hectares.
  - Crops; consent read aloud to the farmer; register.
- **Create lot draft:** pick the farmer → plot → crop/variety → bags → estimated kg. Then show "Ask Anima to confirm on her phone" with the pending state, which updates live via SSE when she signs.
- **Today's queue** at the Changual centre, and **pending sync** items.

## Offline-first (this is what Gopalpur tests)
- Every write goes to an `expo-sqlite` outbox first. A **"বাকি সিঙ্ক" (pending sync)** chip shows the count, and the outbox syncs on reconnect with idempotency keys.
- Reads are cached for offline viewing.
- Add a developer toggle, "Simulate no network", for the demo.

## Design
- Theme `farmer` (contract Section 10).
- Minimum 16 sp text, Bengali at 18 sp for primary content, touch targets ≥ 48 dp, high contrast for sunlight.
- Every action has an icon and a word. Money in bold tabular numerals.
- Big, friendly empty states with a real photo (a potato field in West Bengal, a cold storage, paddy at harvest) from Wikimedia/Unsplash/Pexels, credited.
- **Bengali copy** should sound like someone from a Medinipur village speaking, not machine translation. Mark every string `_review: true`. Hindi and English come second.
- Santali (Ol Chiki) is a stretch goal. Leave the hook in the i18n setup.

## Inbound links (must work)
`fposetu://lot/{sscc}`, `fposetu://statement/{sscc}`, and on web `{URL_FARMER_WEB}/lot/{sscc}` and `/statement/{sscc}`.

## Outbound links
- Each lot links to the consumer page (`deepLink.consumer`).
- Each proof links to the Gov explorer (`deepLink.govTx`).

## Golden-journey steps you own (contract Section 6)
Steps 1 (VLE), 2, 3 (both sides), 10 (statement + read-aloud). Test them with Maestro, or with Playwright on the web build.

## Phase P6 extras
- `eas.json` profiles: `development`, `preview` (APK, internal), `production`.
- `EXPO_PUBLIC_*` env set per profile.
- Put the Expo Go QR, the APK QR and the web URL in `README.md` and in `docs/DISTRIBUTION.md`.
- Send the human a **one-page "how to open the app" card** for the professor, covering Android and iPhone.
