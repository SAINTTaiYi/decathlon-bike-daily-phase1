# Workshop Endfield visual system - V5.7.8

**Status:** in progress
**Base:** `35bcd5a08efe15dc5645011f4b3c904f22c4bad1` (V5.7.7)
**Work branch:** `feat/endfield-maximal-mobile-v577`
**Scope:** visual-only, mobile-first re-art direction of the complete React workspace.

## Locked design contract

- **Family:** original `endfield`-inspired technical field system.
- **Depth:** maximal, expressed through responsive staging, structural typography, instrumentation surfaces, and intentional motion, not fake telemetry or decorative noise.
- **Palette:** mineral off-white, charcoal, a single signal-yellow action/state accent, plus existing semantic success/error states.
- **Geometry:** sharp or clipped corners, hairline rules, grouped planes, high-contrast operational hierarchy.
- **Typography:** retain self-hosted fonts and content; improve hierarchy through weight, scale, spacing, casing, and numerical alignment.
- **Motion:** preserve existing login, workspace assembly, row-completion, and navigation behavior. Only their presentation/timing surfaces may change. All effects retain reduced-motion fallbacks.

## Non-negotiable preservation boundary

Do not change routes, screen order, page/section IDs, navigation targets, form fields, validation, state/data shape, API calls, authorization, workflow rules, audit behavior, or button event handlers. Existing semantic elements, dialogs, focus handling, 44px targets, offline states, and visible labels remain the source of truth.

## Coverage

1. Login, first-admin setup, forced password change, restoration/sync/error states, and the opening animation.
2. Authenticated shell: masthead, user strip, closing summary, release disclosure, hero media, fixed dock, footer, and mobile browser-chrome layout.
3. All six operational sections: KPI, Pickup, Other handover, Repair, Resale, and Sales.
4. Shared record ledgers, selects, actions, empty/error/resolved states, swipe tray, and completion presentation.
5. Every native dialog / secondary menu / report view / form surface.

## Delivery sequence

1. Add shared Endfield theme attributes and a final CSS layer that overrides legacy visual-only rules without changing component control flow.
2. Apply the system to boot/account gates and all shared shell, module, ledger, dialog, and state surfaces.
3. Make small JSX-only visual metadata adjustments where required, without altering behavior.
4. Validate source invariants, Web tests, typecheck, build, and the Ark UI heuristic audit.
5. Review at mobile-first and desktop widths using the available static checks. Browser Harness is prohibited by the user, so no browser-acceptance claim is made. Ship only a Preview candidate after all checks and a reviewable PR.

## Explicit rejections

- No copied Hypergryph / Endfield / Arknights logos, character art, screenshots, UI assets, fonts, or proprietary materials.
- No generic cyberpunk, neon glow, random hexagons, scanlines, fake system codes, or fabricated metrics.
- No generic dashboard-card conversion, Google font import, blue/amber palette recommendation, or neo-brutalist treatment from generic pattern advice.
- No Staging or Production action.

## Validation checklist

- Preserve semantic controls, keyboard flow, dialog behavior, and touch target size.
- Verify desktop and portrait CSS fallback paths including narrow 320-374px screens.
- Verify forced-colors and `prefers-reduced-motion` override behavior.
- Run `pnpm test`, `pnpm typecheck`, and `pnpm build`.
- Run the Ark UI audit against the new final visual CSS.
- Record actual commands/results and final SHA in this checkpoint before PR/deployment work.

## Validation checkpoint

- **Validated:** 2026-07-24T23:13:00+08:00
- **Scope completed:** Full visual-only Endfield system across the authenticated workspace, all six operational sections, navigation, record surfaces, dialogs, login, first-run setup, forced password change, restoration/error states, and opening/workspace presentation.
- **Behavior preserved:** Routes, section IDs, user flows, form controls, event handlers, workflow/API state, authorization, audit behavior, native dialog semantics, keyboard/focus handling, offline behavior, 44px targets, and reduced-motion logic were not changed.
- **Validation passed:** `pnpm test` (Domain 4/4, Database 5/5, Web 96/96, API 16/16, Worker 11/11); `pnpm typecheck`; `pnpm check:workflows` (88 policies); `pnpm build`; `pnpm cf:typecheck`; `pnpm build:worker-bundle`.
- **Static Endfield audit:** 4 theme roots; zero added thick left status stripes; reduced-motion, forced-colors, 320-374px, and 1080px+ rules present; no external style resources; no protected product references.
- **Visual acceptance caveat:** Browser Harness/browser automation is prohibited by user policy, so automated visual screenshot acceptance is intentionally not claimed. Preview remains untouched until a normal review/release phase is explicitly requested.
- **Release boundary:** Preview-only is the only future deployment candidate. Staging and Production remain forbidden and untouched.
