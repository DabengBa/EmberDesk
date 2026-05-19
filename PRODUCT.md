# Product

## Register

product

## Users

Two overlapping groups share the workspace:

**LLM power users** spend hours in a single session. They manage multiple models, tweak parameters in real time, and treat the interface as a persistent workbench rather than a disposable chat window. Screen real estate and low-latency feedback matter more to them than onboarding polish. They will discover every shortcut, pin every panel, and push the density to its limit.

**General AI chat users** come for a conversation and stay for the control. They want the interface to get out of the way: type, read, respond. They benefit from the same density but shouldn't need to configure anything to have a good experience. The defaults must be excellent.

Both groups share one expectation: this is their private space. Self-hosting means no telemetry, no upsells, no "try Pro" banners. The interface should feel like a tool that belongs to the user, not a service they're renting.

## Product Purpose

EmberDesk is a self-hosted LLM frontend that gives users full control over how they interact with language models. It exists because every hosted alternative imposes constraints: rate limits, content policies, UI decisions, data retention. EmberDesk removes those constraints.

Success looks like a user who installs it once, configures it to their taste, and then forgets it's there. The interface becomes infrastructure, not a destination.

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
