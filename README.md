# Baby Milk Tracker

A shared baby feeding tracker for web + iOS. One-handed feed logging with a family-realtime shared timeline, a smart next-feed prediction card, baby profiles with age-bracket intake guidelines (informational, not medical advice), and local notifications that fire at the predicted next-feed time. Stack: Expo + React Native + TypeScript, Firebase JS SDK (Auth with email/password, Firestore), and `expo-notifications` for local scheduled notifications. Dependencies are pinned with npm `save-exact`.

## Features

1. **One-handed logging, family realtime sharing** — tap in a feed (amount, milk type) in seconds; every family member sees the shared feed timeline update live via Firestore listeners, with each feed showing who recorded it.
2. **Smart next-feed card** — a prominent card predicts the next feed time and a suggested amount from recent feeding history.
3. **Baby profile + age-bracket guidelines** — each baby has a profile (name, birthdate); age-bracket intake guidelines are shown next to your actuals. These are general informational references only, **not medical advice** — always check with your pediatrician.
4. **Local notifications at predicted next-feed time** — a local notification is scheduled for the predicted next feed and rescheduled on every new log, so reminders always follow the freshest prediction. No server needed.
5. **Adaptive math** — rolling actuals (avg interval, avg amount from your logged feeds) are shown side by side with the textbook guideline numbers, so you can see how your baby's pattern compares.

## Playful UX (the delight layer)

The app is built to feel rewarding, not clinical:

- **🕐 Dynamic 3D feed clock (home hero)** — `components/FeedClock.tsx` renders a 24-hour dial with [@shopify/react-native-skia](https://docs.expo.dev/versions/latest/sdk/skia/) (bundled in Expo Go — no dev build needed). Past feeds are markers around the dial (size ≈ amount, color ≈ milk type: pink breast / blue formula / teal pumped / purple mixed); an animated hand sweeps toward the predicted next-feed time with a pulsing ring on the upcoming marker; the center shows the countdown and suggested amount. **Tapping a marker reveals that feed's details** (time, amount, milk type, who logged it). Depth comes from radial gradients, soft shadows, and a glass gloss — 2.5D, tactile, 60fps.
- **🍼 Playful logging** — `components/MilkBottle.tsx` is an animated Skia milk bottle that fills (with rising bubbles) as you pick an amount — presets stay one-tap so the 3am flow is still under ~10 seconds. Milk-type and preset chips are chunky and bounce on press (`BouncyChip`, RN Animated on the UI thread). Saving fires **haptic feedback** (`expo-haptics`, native only) plus a **confetti burst** (`components/ConfettiBurst.tsx`), and the new feed's marker pops onto the clock with a gentle pulse.
- **Performance & accessibility** — all Skia/Reanimated animation runs on the UI thread (no JS-thread jank). The OS **reduced-motion** setting is respected everywhere (`lib/useReducedMotion.ts`): the sweep hand jumps to its final position, bubbles/confetti/pulses are disabled. Web rendering goes through CanvasKit WASM, loaded in `index.web.ts` before the app mounts (`LoadSkiaWeb`); if it fails, the app still renders — Skia canvases just stay blank.
- **Build notes** — `babel.config.js` exists to register the `react-native-reanimated/plugin` (required for worklets). It resolves `babel-preset-expo` robustly because this template doesn't hoist it. `index.web.ts` is picked up because `package.json` `main` is `"index"` (platform extensions apply); keep it that way. The `postinstall` script copies `canvaskit.wasm` into `public/` so `expo export --platform web` serves it at the site root.

## Architecture & data model

This repo is the Expo app; `firestore.rules` at the repo root is the Firestore security ruleset; `lib/predict.ts` is a pure, tested module (`predictNextFeed(feeds)` → `nextFeedAtMs`, `suggestedAmountMl`, `avgAmountMl`, `avgIntervalMs`) that is also the hook point for future AI insights.

Firestore collections:

- `families/{familyId}`: `{ name, inviteCode (6-char), memberUids: string[], createdAt }`
- `families/{familyId}/babies/{babyId}`: `{ name, birthdate (ISO YYYY-MM-DD), notes? }`
- `families/{familyId}/feeds/{feedId}`: `{ babyId, amountMl (canonical ml), milkType: 'breast' | 'formula' | 'pumped' | 'mixed', timestamp (ms epoch), recordedByUid, recordedByName, note? }`
- `families/{familyId}/devices/{deviceId}`: `{ uid, platform, expoPushToken? }` — collected best-effort for future server push; the MVP uses local scheduled notifications only.

## Firebase setup

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new Firebase project.
2. Build > **Authentication** > Sign-in method > enable **Email/Password**.
3. Build > **Firestore Database** > Create database (choose your region; production mode is fine since rules are strict).
4. Open the **Rules** tab, paste the contents of `firestore.rules`, and **Publish**.
5. Project settings (gear icon) > Your apps > add a **web app**, then copy the config values into `.env` (see below).

## Environment variables

Set in `.env` — **never commit this file**. `.env.example` documents the names only. No secrets anywhere in the repo.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Project ID |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase app ID |

`EXPO_PUBLIC_*` values are public-by-design client keys — they ship in the app bundle. They are safe to expose because data access is enforced by the Firestore security rules (membership in `memberUids`), not by key secrecy.

## Run it

**iOS:**
```bash
npx expo start
```
Scan the QR code with the Expo Go app — no Apple Developer account needed.

**Web:**
```bash
npx expo start --web
```
Production-ish check: `npx expo export --platform web`, then serve `dist/`.

**Tests:**
```bash
npx jest lib
```

## Family invite codes

1. Create a family → you get a 6-character invite code.
2. Share the code out-of-band (text, call, whatever works).
3. The other person enters the code on the join screen.
4. Every member then sees the same shared feed timeline in realtime, with each feed labeled by who recorded it.

## v2 roadmap

### (a) Whole-family push notifications

The `devices` collection already collects Expo push tokens. The sketch: a Cloud Function triggered on feed creation computes the next-feed prediction, then sends an Expo push to every *other* member's tokens.

```ts
// functions/src/index.ts (pseudo-code)
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { Expo } from "expo-server-sdk";

export const onFeedCreated = onDocumentCreated(
  "families/{familyId}/feeds/{feedId}",
  async (event) => {
    const expo = new Expo();
    const snap = event.data;
    if (!snap) return;
    const { familyId } = event.params;
    const feed = snap.data(); // familyId, babyId, recordedByUid...

    // 1. Load other members' devices with expoPushToken
    const devices = await admin.firestore()
      .collection(`families/${familyId}/devices`)
      .where("expoPushToken", "!=", null)
      .where("uid", "!=", feed.recordedByUid)
      .get();

    // 2. Compute prediction for the baby
    const prediction = predictNextFeed(await loadRecentFeeds(familyId, feed.babyId));

    // 3. Push to everyone else
    const messages = devices.docs.map(d => ({
      to: d.data().expoPushToken,
      title: `${feed.recordedByName} logged a feed`,
      body: `${feed.amountMl} ml • next feed ~${formatTime(prediction.nextFeedAtMs)}`,
    }));
    for (const chunk of expo.chunkPushNotifications(messages)) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  }
);
```

### (b) AI insights

**LLM-seeded starting guidelines (one call per baby, not per feed):** when a baby profile is created, `ensureGuidelines()` in `lib/llmGuidelines.ts` makes ONE LLM call with the baby's age (weeks, from birthdate) and location (country/region) to generate personalized initial feeding heuristics. Regional norms differ (WHO vs AAP), hence the location input. The result is validated and cached in Firestore at `families/{familyId}/babies/{babyId}/guidelines/current` (`generatedAt`, `ageWeeks`, `ageBracket`, `location`, payload) — the same age bracket is never generated twice; the cache is reused. Re-seed triggers: the baby crosses into a new age bracket (0–1m → 1–3m → 3–6m → 6–12m; the UI nudges), or the manual "↻ Refresh guidelines" button. Provider is behind a small interface (`GuidelineProvider`) — OpenAI is the default (`EXPO_PUBLIC_OPENAI_API_KEY`, model override via `EXPO_PUBLIC_GUIDELINES_MODEL`); an Anthropic implementation can be swapped in later. The prompt constrains output to general guidance with a mandatory consult-your-pediatrician disclaimer and requests strict JSON (`feedsPerDay`, `amountPerFeedMl`, `totalDailyMl`, `nightFeedsExpected`, `notes`); the JSON is validated before saving, with one retry on parse failure.

**Privacy:** only age + location are ever sent to the LLM — never the baby's name, family details, or identifiers (enforced in `buildUserPrompt`; noted in code comments).

**Cost:** one call per baby profile + one per bracket refresh — a few hundred tokens on a mini model, fractions of a cent. Without an API key the app silently uses the built-in static table — no key required, fully offline-capable.

**Ongoing predictions:** hook point is `predictNextFeed` in `lib/predict.ts`. It is a pure function — feeds in, prediction out — so you can swap in your own model without touching UI or Firestore code. Candidate insights:

- **Per-baby learned intervals by time of day** — morning vs. night gaps differ; weight recent feeds by hour.
- **Growth-spurt detection** — flag a run of days where interval shrinks and intake climbs vs. the baby's baseline.
- **Intake-vs-guideline anomaly flags** — alert when actuals drift materially outside the age-bracket guideline range, framed as a "worth mentioning to your pediatrician" nudge (not medical advice).

## Security notes

- No secrets anywhere in the repo; `.env` is gitignored and only its names are documented.
- Firestore rules enforce that only authenticated users whose uid is in a family's `memberUids` can read/write that family and its `babies`/`feeds`/`devices` subcollections. Family creation requires the creator to include themselves in `memberUids`.
- Local notifications are scheduled on-device; no server component, no tokens leaving the phone.

## What you must do yourself

- Create the Firebase project and fill in `.env` (steps above).
- Apple Developer account is only needed later for TestFlight — it is **not** needed to run the MVP in Expo Go.
