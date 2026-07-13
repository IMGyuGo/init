# Issue #240 Design QA

## Comparison setup

- Source visual truth: user-provided company login reference (`스크린샷 2026-07-14 오전 1.07.31.png`) for the split layout, plus `design.md` for the Notion color, radius, border, and elevation tokens.
- Implementation routes: `/` guest header and `/company/login` unauthenticated state.
- Viewport: 1280 × 720.
- Full-view evidence: `design-qa-home-240.png`, `design-qa-company-login-240.png`.
- Focused comparison: the header actions and company form controls were also checked through computed styles; a separate crop was unnecessary because both regions are legible in the full-view captures.

## Fidelity surfaces

| Surface | Result | Notes |
| --- | --- | --- |
| Typography | Passed | The company form retains the existing INIT hierarchy while removing both visible `INIT FOR BUSINESS` kickers. |
| Spacing and layout | Passed | The reference split composition remains intact; Notion-style 6 px controls, 8 px benefit cards, and a 10 px visual panel replace the previous pill/glass treatment. |
| Color and tokens | Passed | Guest and login CTAs use `#3b6fe0`/`#315fc6`; secondary actions use white, `rgba(55, 53, 47, 0.16)` borders, and no shadow. |
| Image quality | Passed | The existing company visual raster remains correctly cropped and sharp; no replacement or synthetic inline artwork was introduced. |
| Copy and content | Passed | The requested English business kicker is absent from the rendered DOM and the Korean company-service copy remains coherent. |

## Findings and comparison history

- Initial header capture found that later legacy `.app-shell .btn` rules overrode the intended Notion tokens, leaving pill radii, a gradient, and a shadow.
- The selectors were scoped to `.app-shell .gnb-right.candidate-guest-actions`, then rebuilt and recaptured.
- Initial company form inspection found the same legacy cascade kept input radii at 11 px. The company input selector was strengthened and the build was recaptured.
- Post-fix computed values:
  - Header `로그인`: `#3b6fe0`, 6 px radius, no shadow, 38 px height.
  - Header `기업 서비스`: white background, 1 px neutral border, 6 px radius, no shadow, 38 px height.
  - Company inputs and login CTA: 6 px radius; blue focus/primary tokens; no shadow.
- Primary interactions checked: `/login` and `/company/login` targets, company password-visibility control, and focus styling.
- Browser-rendered DOM had no error overlay; the previously verified console state for this route was empty, and this style-only iteration introduced no browser runtime errors during capture.
- No actionable P0, P1, or P2 visual findings remain.

## Final result

final result: passed
