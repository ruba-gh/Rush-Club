# Rush Members Club

A responsive Rush web app with three primary views: Leaderboard, Membership, and Awards. Built with React, Vinext, and Cloudflare D1. Arabic is the default language, with English available from the header. Email is not collected.

## Included

- Arabic and English UI, RTL/LTR layouts, saved language preference, localized dates, counts, validation and API error messages. Arabic and Persian digits are accepted in phone numbers and PINs.
- Reference palette: #1C1718, #99574D, #DBA18F, #E7CAB7, #FFFAF7. Supplied brand artwork is optimized in public/images.

- Saudi phone number + five-digit PIN signup and login. Leading zeros in a PIN are preserved.
- Salted PBKDF2 PIN hashes, hashed server sessions in HttpOnly/Secure cookies, server authorization, same-origin checks, account and IP attempt limits.
- Name editing, PIN changes (revokes all sessions), sign out, and permanent deletion requiring current PIN plus DELETE confirmation. Related game records, awards, and sessions are removed.
- Real database leaderboard using organizer-recorded attendance; last seven days and all time. Only names, IDs, and game totals are returned, never phone numbers.
- Clearly labeled sample preview with invented stats and separate live club mode.
- Award gallery and detail dialogs. No award conditions are enabled initially.

## Content and configuration

- `app/page.tsx`: page copy, sample players, navigation, client interactions.
- `lib/i18n.ts`: Arabic award copy, category names, and translated API errors. Other page copy is paired in the `t(English, Arabic)` calls in `app/page.tsx`.
- `app/globals.css`: responsive styles, colors, badge artwork.
- `lib/award-catalog.ts`: award names, descriptions, and `awardConditions`. All conditions are null initially. When the organizer chooses rules, configure a metric and threshold. Supported metrics: `game`, `free_game`, `top_three_week`. Counts come from trusted activity records; members cannot write activity or award records through the API.
- `app/api/club/route.ts`: account API and leaderboard.
- `db/schema.ts` and `drizzle/`: database schema and migrations.

## Remaining setup before opening to players

1. Connect an SMS provider for phone ownership verification and PIN recovery. Current phone + PIN login does not verify phone ownership; signup can reserve a number without an SMS. Keep this private development version until verification is added. Five-digit PINs have limited entropy; strict attempt limits are included.
2. Choose exact scoring, award thresholds, weekly reset timing, and free-game rules. The current proposed ranking is by attended games, using a rolling seven-day window. The final weekly podium rules have not been chosen.
3. Add the organizer's attendance and reward management workflow. There is deliberately no public activity-write API. Record one `top_three_week` event per member per eligible week when the final weekly calculation is implemented. Free games are counts only; this version does not issue redeemable tickets or accept bookings/payments.
4. Decide how historical leaderboard entries should be handled when a member deletes their account. This version removes them along with all linked records.

## Run and validate

Install dependencies with the Sites install helper or the configured package manager. Use `npm run dev` for development and `npm run build` for standalone build. Sites uses its build helper and hosting manifest. Apply the generated D1 migration to your local database before exercising real accounts. Sites applies production migrations on deploy.

`node tests/accounts.mjs` tests account behavior against an isolated in-memory SQLite database without creating real members. `node node_modules/typescript/bin/tsc --noEmit` checks types.

## GitHub handoff

Source repository: https://github.com/ruba-gh/Rush-Club. Keep the source, migrations, and lockfile; exclude node_modules, dist, .wrangler, .sites-runtime, and secrets. `.openai/hosting.json` identifies the existing private Sites deployment. A GitHub Pages-only deployment cannot run this backend; it requires a Worker-compatible server and a D1 database, or an adapter to another backend.
