# Workshop desktop shared-card visual feedback R3

## Scope

Preview-only follow-up from deployed source `dfbd72b3c9cfe49a7231c86c5d7f2db9693c7c6d` (administrative head `f0e116f23716bab3ac4467560e3fef53b346ecf6`). Public version remains V5.8.1. Production and Production D1 are prohibited.

## Reported defects and root causes

1. **Operations Index text clipping:** desktop font sizes inherited the compact phone line-height boxes, clipping the enlarged English/Chinese labels and values.
2. **Overview rail crossed by a rule:** the desktop rail started at native y=132 while the complete navigation/header stack ends at y=156.
3. **Queue Status misalignment:** 34px values inherited an 18px line-height and shared an implicit row with their Chinese labels.
4. **Expanded actions too wide:** the shared desktop PickupLedger changed actions to equal-width grid tracks.
5. **Collapsed right-edge outline:** collapsed PickupLedger rows retained the full rounded card border, most visibly at the far right.

## Implementation

- Reset native desktop line heights for every Operations Index text layer.
- Move the left rail below the complete 156px navigation stack.
- Give Queue Status numbers and labels explicit independent rows.
- Use wrapping, content-width shared actions with bounded 148–220px widths and a 190px primary action.
- Remove border/radius/shadow only from collapsed desktop rows; expanded cards keep their intended surface.
- Apply fixes through shared desktop selectors so Pickup, Other Handover, and Repair are covered together. Phone layout is unchanged.

## Gates

- CodeGraph pre-edit: 197 files / 2,346 nodes / 7,761 edges, up to date.
- Targeted desktop/shared-ledger contracts: 23 passed, 0 failed.
- Full repository tests, typecheck, 88 workflow policies and post-change CodeGraph passed locally. Preview registration/build, PR/CI, Cloudflare Preview and independent online verification continue below.
- CSS and Markdown are explicit CodeGraph non-indexed exceptions; compensating contract tests, build output and deployment asset verification are required.
