# TubeMateX — Design System Governance

## Source of truth

The framework-free frontend keeps its existing HTML/CSS/JavaScript architecture. New visual work must use the shared foundation in `frontend/css/design-system.css`, shared patterns in `frontend/css/components.css`, and safe DOM helpers in `frontend/js/components.js`. Do not introduce a frontend framework or a second independent token file.

### Token layers

- **Primitive tokens** (`--tmx-color-*`, `--tmx-space-*`, `--tmx-radius-*`) contain palette values and scale measurements. Page-specific selectors should not consume primitive colors directly.
- **Semantic tokens** (`--tmx-bg`, `--tmx-surface`, `--tmx-text-primary`, `--tmx-text-secondary`, `--tmx-accent`, `--tmx-danger`, `--tmx-state-*`, `--tmx-control-*`) describe a UI role and are the preferred API for new components.
- **Workspace accent tokens** (`--tmx-accent-entertainment`, `--tmx-accent-social`, `--tmx-accent-downloads`, `--tmx-accent-creative`) are approved exceptions for a workspace identity. They do not permit each page to invent another palette.
- Use semantic spacing, radius, surface, text and focus roles. Avoid hard-coded colors in shared components; add a primitive first, then name its semantic role.

## Legacy alias migration policy

Aliases such as `--h-*`, `--u-*` and `--space-*` are compatibility adapters, not a second source of truth.

1. Existing aliases remain while page-specific CSS is migrated; do not remove or rename them in a broad cleanup.
2. When adding a new alias, define it only as a reference to an approved semantic token. Do not put a new literal color into an alias.
3. New or substantially edited components must use `--tmx-*` semantic tokens directly.
4. When editing a legacy page, migrate the declarations touched by that change and add a regression check if the old alias is no longer needed.
5. Remove an alias only after repository-wide search confirms no remaining references and the affected pages pass contrast, accessibility and responsive checks.
6. Record temporary exceptions here or in the component stylesheet with a reason and an owner/review target. Do not add new aliases solely to avoid updating a component.

## Component API

Use the shared class patterns where applicable. Existing page classes can remain as adapters while the migration is incremental.

| Pattern | Variants / states | Required behavior |
| --- | --- | --- |
| `.tmx-btn` | `--primary`, `--quiet`, `--danger`, disabled, hover, active, focus-visible | Use a real button for actions and a link for navigation; preserve keyboard focus and disabled semantics. |
| `.tmx-field` / `__control` | default, hint, `aria-invalid=true`, focus-visible, disabled | Visible label, programmatic label/control association, helpful error text and stable touch target. |
| `.tmx-card` | default and content-specific composition | Keep title, metadata and actions in a predictable order; don't make the whole card clickable if it contains multiple actions. |
| `.tmx-badge` | default, `--success`, `--warning`, `--danger` | Pair color with text or an icon; never use color as the only status signal. |
| `.tmx-state` | loading, empty, success, error, unavailable | Explain what happened and the next useful action; loading must be announced and may expose `aria-busy`. |
| `.tmx-progress` | determinate native `progress` element | The value must come from actual task state; include a textual status and do not invent a percentage or ETA. |
| `.tmx-toast` | info, success, warning, error | Use `role=status` for routine feedback and `role=alert` only for urgent errors. Don't announce the same message twice. |
| `.tmx-dialog` | open, close, confirm/cancel | Prefer native `dialog`; label it, keep focus inside while open, restore focus to the opener, and support Escape when appropriate. |
| `.tmx-pagination` | current, enabled, disabled | Mark the current page with `aria-current=page`; give previous/next controls descriptive names. |

Vanilla JS helpers `TMXComponents.createButton`, `createState` and `createToast` build safe DOM nodes and set the core accessibility attributes. Use `textContent` for user- or source-provided text; do not interpolate untrusted strings into HTML.

## Workspace theming

The shared shell and component behavior stay consistent across Search, Music, Social, Cine, Downloads, Library, Settings and Admin. A workspace may use its approved semantic accent, but must retain shared focus rings, typography hierarchy, control dimensions, status semantics and responsive behavior. Do not add a new font family or independent focus color for a single page.

## Responsive and accessibility acceptance checklist

- [ ] No unintended horizontal overflow at 320 px or 375 px.
- [ ] Check tablet and desktop layouts and browser zoom at 200%; primary actions remain reachable.
- [ ] Keyboard-only flow has logical tab order, visible focus and no keyboard trap.
- [ ] Inputs have visible labels; icon-only actions have accessible names.
- [ ] Loading, empty, success, error, cancellation and retry states are distinct and understandable.
- [ ] Progress and ETA reflect backend data; unknown values are shown as unknown rather than guessed.
- [ ] Contrast tests pass for light/dark themes and approved workspace accents.
- [ ] Reduced-motion and forced-colors modes remain supported.
- [ ] A visual change is reviewed on at least one representative page per affected workspace.

## Adding a component or changing a token

1. Confirm an existing semantic token or component cannot meet the need.
2. Add primitive values only when a genuinely new palette value/scale measurement is needed; expose it through a semantic token.
3. Document component variants and state behavior, including keyboard and screen-reader expectations.
4. Add or update automated governance, contrast and accessibility checks.
5. Test representative desktop/mobile states before merge. Automated checks supplement, not replace, manual assistive-technology review.
