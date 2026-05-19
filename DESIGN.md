---
version: alpha
name: EmberDesk
description: >
  Dark, atmospheric, utility-dense design system for a self-hosted LLM frontend.
  Optimized for power users who spend hours in a single workspace — every pixel
  earns its place through function, not decoration.

colors:
  surface: "#171717"
  surface-muted: "#4B4B4B"
  amber-accent: "#E88A24"
  ivory: "#DCDCD2"
  ivory-faint: "#BCBCB4"
  ash-gray: "#919191"
  mint-underline: "#BCE7CF"
  frost-blue: "#92BEFC"
  clay-warning: "#D78872"
  ember-red: "#CC0000"
  ember-deep: "#640000"
  success-green: "#58B600"

typography:
  display:
    fontFamily: "Noto Sans, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.4
  headline:
    fontFamily: "Noto Sans, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 700
    lineHeight: 1.4
  title:
    fontFamily: "Noto Sans, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Noto Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Noto Sans, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: "Noto Sans Mono, Courier New, Consolas, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.0

rounded:
  xs: "2px"
  sm: "3px"
  md: "5px"
  lg: "10px"
  pill: "50%"

spacing:
  xs: "2px"
  sm: "5px"
  md: "10px"
  lg: "15px"
  xl: "20px"
  xxl: "30px"

components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.md}"
    padding: "3px 5px"
    typography: "{typography.label}"
  button-hover:
    backgroundColor: "#7F7F7F"
  button-danger:
    backgroundColor: "{colors.ember-deep}"
    textColor: "{colors.ivory}"
  input:
    backgroundColor: "#000000"
    textColor: "{colors.ivory}"
    rounded: "{rounded.md}"
    padding: "3px 5px"
    typography: "{typography.body}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.lg}"
    padding: "2px 14px"
  popup:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ivory}"
    rounded: "{rounded.lg}"
    padding: "4px 14px"
    width: "500px"
  tag:
    backgroundColor: "#000000"
    textColor: "{colors.ivory}"
    rounded: "{rounded.md}"
    padding: "0.1rem 0.2rem"
  tag-actionable:
    rounded: "{rounded.pill}"
    size: "2rem"
  chat-bubble:
    backgroundColor: "#000000"
    textColor: "{colors.ivory}"
    padding: "10px"
---

## Overview

**Creative North Star: "The Workshop at Midnight"**

EmberDesk is a self-hosted LLM frontend built for users who spend hours inside the application. The design philosophy is **functional warmth** — a dense, low-fatigue workspace where dark surfaces are layered with blur and tint to create atmosphere, not drama. Every pixel earns its place through utility, not ornamentation.

This is not a showroom. It is a well-worn desk: compact controls, information-rich surfaces, and a palette that rewards long sessions without eye strain. The interface should feel like a tool that belongs to the user, not a service they're renting. Density is respect for the user's time, not a compromise.

The system explicitly rejects the visual language of consumer AI tools: no white backgrounds, no rounded pastel cards, no cartoon illustrations, no "powered by AI" badges. It rejects SaaS dashboard clichés: no hero metrics, no gradient accent cards, no identical card grids. It rejects the sterile cleanliness of ChatGPT-style minimalism. And it rejects neon-on-black cyberpunk performance: the dark theme is warm and atmospheric, not dramatic.

**Key Characteristics:**
- Atmospheric blur overlays create depth without competing with content
- Semantic color is sparse and meaningful: amber for speech, green for success, red for danger
- Controls are compact; density never sacrifices clarity
- Every surface is configurable; the user's choices persist without friction

## Colors

The palette is deliberately muted. Near-black surfaces, ivory text, with color reserved for semantic meaning. The entire color system is overridable: users can customize every token via theme settings, and the built-in ThemeGenerator can algorithmically derive a palette from a background image using OKLCH color math, enforcing WCAG contrast ratios automatically.

### Primary
- **Warm Charcoal** (#171717): The default surface. Close to black but warm enough to avoid the clinical feel of pure `#000`. Used for panel backgrounds, popup bodies, and the main workspace. Implementation note: OKLCH-derived, often expressed as `rgba(23, 23, 23, 1)` in CSS for alpha compatibility.

### Secondary
- **Muted Umber** (#4B4B4B): Secondary surfaces and borders. Provides subtle separation between layered elements without harsh contrast.

### Tertiary
- **Hearthside Amber** (#E88A24): The loudest color in the system. Marks in-line quotes (`<q>`) and emphasis — it signals "someone is speaking." Used sparingly; its rarity is the point.

### Neutral
- **Ivory** (#DCDCD2): Primary text. A muted off-white that reads comfortably against dark surfaces without the harshness of pure white.
- **Warm Gray** (#919191): Secondary text for labels, timestamps, and metadata. First tier of de-emphasis.
- **Faint Ivory** (#BCBCB4): Muted text at reduced opacity. Second tier of de-emphasis for auxiliary information.

### Semantic
- **Mint Underline** (#BCE7CF): Underlines and success indicators. A soft, cool green that doesn't compete with amber for attention.
- **Ember Red** (#CC0000): Destructive actions and error text. Never used decoratively.
- **Deep Ember** (#640000): Filled danger backgrounds. Paired with Ember Red text for destructive UI states.
- **Frost Blue** (#92BEFC): Informational callouts and links.
- **Clay Warning** (#D78872): Warning states. Warm enough to stay in palette.
- **Success Green** (#58B600): Positive status indicators and confirmation states.

### Named Rules

**The Amber Rarity Rule.** Amber is the loudest color in the default theme. It appears on quotes and emphasis only. If amber covers more than a few percent of any screen, it has been overused.

**The No Pure White Rule.** Pure white (`#FFF`) is never used for text. Always use Ivory (`#DCDCD2`). Pure black (`#000`) is similarly avoided for surfaces — use Warm Charcoal (`#171717`). This prevents the clinical harshness that causes eye strain in long sessions.

## Typography

**Display Font:** Noto Sans (with system sans-serif fallback)
**Body Font:** Noto Sans (with system sans-serif fallback)
**Mono Font:** Noto Sans Mono (with Courier New, Consolas fallback)

**Character:** Clean, neutral, wide language support. Noto Sans is well-hinted at small sizes and renders crisply against dark surfaces. The globally applied text shadow (`0px 0px Npx shadow`) gives text a slightly floating, soft-edged quality that reduces the harsh pixel-clarity feel of dense dark UIs — a deliberate aesthetic choice that also improves legibility against varied background images.

The base font size is **15px**, scaled by a user-adjustable `--fontScale` multiplier. All other sizes derive from this single root, so a user who scales up for a HiDPI display or accessibility needs gets proportional scaling everywhere. Line height follows a formula tied to font size (`calc(var(--mainFontSize) + 0.5rem)`), keeping text blocks breathable without wasting vertical space.

### Hierarchy
- **Display** (700, 1.5rem, line-height 1.4): Page-level headings. Reserved for true headings that define a section.
- **Headline** (700, 1.2rem, line-height 1.4): Sub-section headings and panel titles.
- **Title** (600, 1.05rem, line-height 1.4): Component-level headings, card titles, dialog headers.
- **Body** (400, 1rem, line-height 1.5): Default text. Max line length 65-75ch for readability.
- **Label** (500, 0.95rem, line-height 1.3): Button text, form labels, tags, navigation items.
- **Mono** (400, 1rem, line-height 1.0): Code blocks, terminal output, technical labels.

### Named Rules

**The Scalable Root Rule.** Never use fixed pixel values for font sizes. Always derive from `--mainFontSize` and the `--fontScale` multiplier. This is non-negotiable for accessibility and HiDPI support.

**The Weight Restraint Rule.** Weight usage is restrained: 400 for body, 500 for labels and emphasis, 600 for sub-headings, 700 for true headings. No lighter or heavier weights are used.

## Layout

The layout is a centered single-column workspace. The main chat shell (`#sheld`) occupies a user-configurable width (default `50vw`), centered in the viewport. A fixed top bar sits above, and a send form anchors the bottom. Side panels (character list, settings, extensions) overlay from the edges or replace the chat area depending on viewport width.

Spacing is deliberately tight. Gaps between interactive elements default to **5px**. Container padding is **10px** for most panels. The philosophy is: whitespace should exist where it aids scanning — between logically distinct groups — not as a blanket luxury margin.

The layout is responsive by necessity (multi-device self-hosting) but not mobile-first. Desktop is the primary environment; mobile layouts adapt via `@media` queries that stack panels vertically and adjust control sizes.

Panel shell containers are present in the initial HTML for instant first paint. Heavy inner content (settings sections, character cards) is deferred and rendered after the app-ready event, then state is replayed into late-loaded DOM.

### Spacing Scale
- **xs** (2px): Hairline gaps, border offsets.
- **sm** (5px): Default gap between interactive elements. The baseline rhythm.
- **md** (10px): Container padding for most panels. Standard internal spacing.
- **lg** (15px): Section separation within panels.
- **xl** (20px): Major section boundaries.
- **xxl** (30px): Top-level layout spacing, rarely used in dense UI.

### Named Rules

**The Functional Whitespace Rule.** Whitespace should exist where it aids scanning — between logically distinct groups — not as a blanket luxury margin. If removing padding doesn't hurt comprehension, the padding was decorative.

**The Shell-First Rule.** Panel shells are in the initial HTML for instant first paint. Heavy inner content is deferred. The user sees structure immediately, content arrives next.

## Elevation & Depth

EmberDesk creates depth through **blur overlays** rather than drop shadows or material-style elevation layers.

The blur system has two configurable variables: `--blurStrength` (default 10, controlling the `backdrop-filter: blur()` radius) and `--shadowWidth` (default 2, controlling the text shadow spread). The top bar, chat area, popup backdrop, and options menu all use `backdrop-filter: blur()` against a tinted background (`--SmartThemeBlurTintColor`), creating a frosted-glass effect that reveals the background image beneath.

Box shadows are minimal: `0 0 10px rgba(0, 0, 0, 0.5)` on popups and `0 2px 20px 0 rgba(0, 0, 0, 0.7)` on the top bar — enough to separate layers without competing with the blur system.

The shadow popup overlay (`#shadow_popup`) uses double the blur strength as a backdrop, creating a strong depth separation between the active modal and the dimmed workspace behind it.

### Shadow Vocabulary
- **Popup shadow** (`0 0 10px rgba(0, 0, 0, 0.5)`): Separates popups and dialogs from the workspace.
- **Top bar shadow** (`0 2px 20px 0 rgba(0, 0, 0, 0.7)`): Anchors the top bar above the content area.

### Named Rules

**The Blur-Over-Shadow Rule.** Depth is created primarily through blur overlays, not drop shadows. Box shadows are minimal and structural — they separate layers, not decorate them. If a shadow is doing the work that a blur overlay should be doing, replace it.

**The User-Controlled Depth Rule.** Both `--blurStrength` and `--shadowWidth` are user-configurable. Never hardcode blur or shadow values that override the user's preferences.

## Shapes

Border radius follows a four-level scale:

- **2px** — avatars in default (square) mode
- **3px** — kbd elements, small inline items
- **5px** — buttons, inputs, tags, textareas, interactable controls
- **10px** — panels, popups, modals, scroll thumbs, code blocks, chat borders

The consistent use of 5px for interactive controls and 10px for container-level surfaces creates a subtle hierarchy: controls feel embedded; containers feel elevated.

Avatars have three shape modes: square (`2px`), rounded (`10px`), and round (`50%`), toggled by user preference.

### Radius Vocabulary
- **xs** (2px): Avatars in square mode, the sharpest elements in the system.
- **sm** (3px): Keyboard shortcuts, small inline items.
- **md** (5px): All interactive controls — buttons, inputs, tags, textareas.
- **lg** (10px): Container surfaces — panels, popups, modals, scroll thumbs, code blocks.
- **pill** (50%): Circular elements — actionable filter tags, avatars in round mode, status dots.

### Named Rules

**The Embedded Controls Rule.** Interactive controls use 5px radius; container surfaces use 10px. This creates a subtle hierarchy: controls feel embedded within the containers they inhabit. Never invert this relationship.

## Components

**Buttons** (`menu_button`) are compact, bordered, and semi-transparent. Background is the surface tint with a 50% grayscale filter that lifts on hover to full brightness. The transition duration is 250ms. Disabled buttons reduce opacity to 0.5 and add `grayscale(0.5)`.

**Inputs and Textareas** share a consistent treatment: `rgba(0, 0, 0, 0.3)` background, 1px border in the theme border color, 5px radius. On focus, the border lightens to `rgba(255, 255, 255, 0.2)` — a subtle but visible focus indicator that works against both light and dark backgrounds.

**Tags** are inline pill-like labels with a semi-transparent background and 1px border. Actionable filter tags are circular (50% radius, aspect-ratio 1:1) and sized to `2x` the base font size for comfortable touch targets.

**Popups/Modals** use the `<dialog>` element, styled at 500px default width with 10px radius, surface-tint background, blur backdrop, and a `pop-in` entrance animation. Content is scrollable with `overflow-y: auto` inside the popup body.

**Chat Messages** (`.mes`) are full-width flex rows with 10px padding. Message text uses Body size at weight 500 for a slightly heavier-than-default reading experience. Inline semantic markup is color-coded: `<em>`/`<i>` in the em color, `<q>` in quote amber, `<u>` in underline green. Code blocks use Mono with a near-black background and 70% white text.

**Status indicators** are 14px circles: green for connected, red for disconnected. They appear in the online status bar with 4px left margin spacing from the label text.

## Do's and Don'ts

### Do:
- **Do** use blur overlays and tinted surfaces for depth — never flat solid-gray panels. Depth is atmospheric, not structural.
- **Do** keep interactive controls at 5px radius; reserve 10px for container surfaces. The hierarchy is deliberate.
- **Do** use opacity transitions (0.5 to 1.0) for hover states on icons and buttons. Transitions are 250ms.
- **Do** use the semantic color tokens consistently: amber for quotes, mint green for underlines and success, red for danger.
- **Do** derive font sizes from `--mainFontSize` and the `--fontScale` multiplier. Never hardcode pixel sizes.
- **Do** provide `:focus-visible` outlines on all interactive elements using the theme outline color.
- **Do** keep panel shells in initial HTML for instant first paint; defer heavy inner content.
- **Do** make density a feature, not a compromise. Compact controls respect the user's screen real estate.

### Don't:
- **Don't** introduce bright or saturated accent colors beyond the established semantic set. The palette is muted by design.
- **Don't** use large border radii (15px+) or heavy drop shadows — they fight the atmospheric blur aesthetic.
- **Don't** add decorative elements that consume vertical space without providing functional information.
- **Don't** use pure white (`#FFF`) for text — always use Ivory (`#DCDCD2`). Pure black (`#000`) is similarly avoided for surfaces.
- **Don't** build a **generic AI tool UI** — no white backgrounds, no rounded pastel cards, no cartoon illustrations, no "powered by AI" badges.
- **Don't** build a **SaaS dashboard cliché** — no hero metrics with big numbers, no gradient accent cards, no identical card grids, no "Start your free trial" energy.
- **Don't** build a **ChatGPT-like clean UI** — no sterile white chat bubbles on gray, no minimal chrome that hides everything behind a sidebar toggle.
- **Don't** build a **neon/cyberpunk aesthetic** — no glowing borders, no neon gradients on black, no "hacker" visual language. The dark theme is warm, not dramatic.
- **Don't** break the ID-based DOM integration pattern with framework component abstractions.
- **Don't** use fixed pixel values for font sizes — always derive from the scalable root.
