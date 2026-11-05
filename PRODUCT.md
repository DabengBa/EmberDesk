# Product

<!-- impeccable:product-schema 1 -->

This file is a non-authoritative, derived design-tool brief. Product facts and behavior are owned by `.docs/`; consult the linked owners for current details and update them there rather than maintaining parallel facts here. The design guidance below is context for design work, not a replacement for those owners.

## Platform

web

## Users

See [audience and operating context](.docs/project-overview.md#audience) for the users and their environments.

## Product Purpose

See [product positioning and direction](.docs/project-overview.md#positioning).

## Positioning

See [positioning](.docs/project-overview.md#positioning).

## Operating Context

See [audience](.docs/project-overview.md#audience) and the [workspace page](.docs/db/pages/chat-workspace.md).

## Capabilities and Constraints

See [current capabilities](.docs/project-overview.md#current-capability-set), [exclusions](.docs/project-overview.md#explicit-exclusions), and the [storage roadmap](.docs/tech/canonical-sqlite-storage-roadmap.md). For individual behaviors and terminology, use the [page](.docs/db/pages/), [feature](.docs/db/features/), and [term](.docs/db/terms/) owners.

## Evidence on Hand

- [Project overview](.docs/project-overview.md) — product direction, audience, architecture, and capabilities.
- [Semantic documentation](.docs/db/) — user-facing pages, features, and terms.
- [Technical notes](.docs/tech/) — implementation and architecture boundaries.

## Product Principles

See the [product principles](.docs/project-overview.md#principles).

## Brand Personality

**Warm, dense, atmospheric.**

The brand voice is that of a well-worn workshop, not a showroom. Surfaces are dark and layered, lit by subtle amber and green accents. The mood is late-night focus: comfortable, unhurried, precise. It should feel like sitting down at a desk you've used for years, where everything is exactly where you left it.

Three words: **functional warmth**.

## Anti-references

What EmberDesk explicitly does not look like:

- **Generic AI tool UI** — white backgrounds, rounded pastel cards, cartoon illustrations, "powered by AI" badges. The entire category of consumer AI tools with gradient CTAs and empty-state illustrations is out of scope.
- **SaaS Dashboard cliché** — hero metrics with big numbers, gradient accent cards, identical card grids, "Start your free trial" energy. Dashboard-ification of a workspace is a failure mode.
- **ChatGPT-like clean UI** — sterile white chat bubbles on gray, minimal chrome, everything hidden behind a sidebar toggle. That design optimizes for first-use simplicity; EmberDesk optimizes for daily-use density.
- **Neon/Cyberpunk aesthetic** — glowing borders, neon gradients on black, "hacker" visual language. The dark theme is atmospheric and warm, not dramatic or performative.

## Design Principles

1. **Density is respect.** Every pixel that doesn't serve function wastes the user's time. Compact controls, tight spacing, and information-rich surfaces honor the user's investment in learning the tool.

2. **Defaults must be excellent.** A new install should feel polished, not like a blank canvas waiting for configuration. The first session must earn the second.

3. **The user owns the workspace.** Self-hosting means total control. The UI should reinforce this: everything is configurable, nothing is locked behind gates, and the user's choices persist without friction.

4. **Atmosphere over decoration.** Blur overlays, tinted surfaces, and text shadows create depth that rewards long sessions. Decoration that doesn't contribute to depth or legibility is noise.

5. **Semantic color is sparse and meaningful.** Color signals state and meaning, not decoration. Amber means someone is speaking. Green means success. Red means danger. The rest is neutral by design.

## Accessibility & Inclusion

- All interactive elements must have `:focus-visible` outlines using the theme's outline color.
- Font sizes derive from a scalable root (`--mainFontSize` × `--fontScale`) so users can adjust for HiDPI or accessibility needs.
- Text shadow and blur strength are user-configurable to accommodate different visual acuity levels.
- Color choices maintain WCAG contrast ratios against the dark surface. The ThemeGenerator enforces this algorithmically when deriving palettes from background images.
- Reduced motion preferences should be respected where animation is used (popup entrance, hover transitions).
