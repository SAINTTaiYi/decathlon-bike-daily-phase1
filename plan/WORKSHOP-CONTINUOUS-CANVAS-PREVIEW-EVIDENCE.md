# Workshop Continuous Canvas Preview Evidence

> **Status: local gates passed; Preview delivery pending.** This file records the replacement for the rejected independent-stage Preview. It does not authorize Production.

## Approved Scope

- Replace six independent black/sticky stage covers with one uninterrupted native-scroll warm canvas.
- Keep all six business modules mounted as invisible semantic landmarks with no visible divider, section band, chapter bar, sticky pause, or module-level outer card.
- Separate adjacent modules through whitespace, offset composition, scale, depth, and independent motion; adjacent modules may briefly coexist.
- Move ultra-long pale-gray/pale-yellow fields, six original transparent Workshop objects, two sparse oversized narratives, two curved-copy motifs, and two seven-word focus trails across module boundaries.
- Keep business headings, filters, summaries, and statistics directly on the canvas; retain compact containers only for repeated records and necessary forms, drawers, and dialogs.
- Use a 42vh active-module focal line with directional hysteresis; preserve dock, URL/history, keyboard, screen-reader, and deep-link navigation.
- Settle the targeted business module in 180–240ms and capture the active pointer so controls remain stable while foreground objects retreat.
- Play the full reveal only for a normal top entry; restored scroll positions and deep links bypass it, and any input can skip it.
- Preserve full motion intensity, depth, duration, layer count, object count, and memory-point count on mobile. Portrait uses purpose-built trajectory geometry rather than reduced effects.

## Local Quality Gates

- Continuous-canvas and workspace source contracts: 14 passed, 0 failed after final interaction, navigation, transparent-header, and motif-envelope refinements.
- Combined mobile/material/update/motion contracts: 33 passed, 0 failed.
- Final full repository test task `workshop-continuous-canvas-final2-tests`: attempts 1, exit 0.
  - Domain: 7 passed.
  - Database: 10 passed.
  - Web: 132 passed.
  - API: 21 passed.
  - Worker: 28 passed.
  - Total: 198 passed, 0 failed.
- Repository typecheck task `workshop-continuous-canvas-final-typecheck`: attempts 1, exit 0; contracts, database, API, and Worker checks passed.
- Direct production Web build: 122 modules transformed; Vite build succeeded in 4.84s after final CSS changes.
- `git diff --check`: clean.
- Bounded credential-pattern scan: no matches. Local Gitleaks is not installed; GitHub CI `secrets` remains authoritative.
- CodeGraph v1.5.0 final post-gate: 192 files / 2,312 nodes / 7,770 edges, up to date. Affected analysis identifies `tests/continuous-canvas-progress.test.mjs`.
- CSS and Markdown are explicit CodeGraph non-indexed exceptions, covered by production build, source-contract tests, and human Preview review.

## Delivery Identity

- Public version remains `V5.7.9`; Preview-only changes do not increment it.
- Functional commit: `7f1bfae289b3285998317c65698637e16f1bc3a8`.
- PR / merge SHA / CI: pending.
- Preview fingerprint: pending clean-commit registration.
- Protected Preview deployment: pending.
- Staging, Production, and Production D1 remain untouched.

## Browser Evidence Limitation

- The required independent `browser-harness` executable is unavailable; only an inert package cache entry exists.
- Per project policy, no application-internal browser tool or Android Accessibility fallback is permitted or used.
- Final visual, bidirectional scrolling, interaction, 390px full-strength motion, dock/deep-link, and reduced-motion acceptance remains a human Preview gate.

## Human Acceptance Checklist

1. Enter normally from the top and verify the full reveal; interrupt it with pointer, wheel, touch, or keyboard input.
2. Open a `#module-<id>` deep link and restore a scrolled page; verify the reveal is bypassed and the target module is focused directly.
3. Scroll down and back up through all six modules; verify one continuous warm space without black covers, sticky pauses, visible separators, or per-module visual resets.
4. Verify adjacent modules briefly coexist without two primary control groups competing.
5. Verify all six Workshop objects cross module boundaries, with foreground objects never capturing clicks or obscuring critical controls/values.
6. Tap, click, and keyboard-focus controls during motion; verify the relevant module settles within 180–240ms and the action still fires.
7. Verify only two sparse oversized narrative moments, two curve motifs, and two word trails appear across the whole page.
8. At 390px, verify full-strength effects remain present, no horizontal overflow occurs, and every business workflow remains usable above the dock.
9. Verify dock state changes around the 42vh focal line without reverse-scroll jitter; Back/Forward and deep links return to the correct modules.
10. Enable reduced motion and forced colors where available; verify complete readable static content and intact controls.
