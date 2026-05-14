---
version: alpha
name: EmberDesk
description: >
  Dark, atmospheric, utility-dense design system for a self-hosted LLM frontend.
  Optimized for power users who spend hours in a single workspace — every pixel
  earns its place through function, not decoration.

colors:
  primary: "#171717"
  secondary: "#4B4B4B"
  tertiary: "#E88A24"
  neutral: "#DCDCD2"
  on-primary: "#DCDCD2"
  on-secondary: "#DCDCD2"
  on-tertiary: "#171717"
  on-neutral: "#171717"
  surface: "rgba(23, 23, 23, 1)"
  surface-low: "rgba(0, 0, 0, 0.3)"
  surface-overlay: "rgba(0, 0, 0, 0.9)"
  border: "rgba(0, 0, 0, 0.5)"
  shadow: "rgba(0, 0, 0, 0.5)"
  text-primary: "#DCDCD2"
  text-secondary: "#919191"
  text-muted: "rgba(220, 220, 210, 0.7)"
  accent-underline: "#BCE7CF"
  accent-quote: "#E88A24"
  accent-code-bg: "rgba(0, 0, 0, 0.7)"
  accent-code-text: "rgba(255, 255, 255, 0.7)"
  success: "rgb(88, 182, 0)"
  danger: "rgba(255, 0, 0, 0.9)"
  danger-fill: "rgba(100, 0, 0, 0.7)"
  info: "#92BEFC"
  warning: "#D78872"

typography:
  h1:
    fontFamily: Noto Sans, sans-serif
    fontSize: 1.5rem
    fontWeight: bold
    lineHeight: 1.4
  h2:
    fontFamily: Noto Sans, sans-serif
    fontSize: 1.2rem
    fontWeight: bold
    lineHeight: 1.4
  h3:
    fontFamily: Noto Sans, sans-serif
    fontSize: 1.05rem
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: Noto Sans, sans-serif
    fontSize: 1rem
    fontWeight: 500
    lineHeight: calc(1rem + 0.5rem)
  body-md:
    fontFamily: Noto Sans, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Noto Sans, sans-serif
    fontSize: 0.8rem
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: Noto Sans, sans-serif
    fontSize: 0.95rem
    fontWeight: 500
    lineHeight: 1.3
  mono:
    fontFamily: Noto Sans Mono, Courier New, Consolas, monospace
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1rem

rounded:
  xs: 2px
  sm: 3px
  md: 5px
  lg: 10px
  pill: 50%

spacing:
  xs: 2px
  sm: 5px
  md: 10px
  lg: 15px
  xl: 20px
  xxl: 30px

components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.md}"
    padding: "3px 5px"
    typography: "{typography.label}"
  button-hover:
    backgroundColor: "rgba(255, 255, 255, 0.3)"
  button-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.text-primary}"
  input:
    backgroundColor: "{colors.surface-low}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.md}"
    padding: "3px 5px"
    typography: "{typography.body-md}"
  input-focus:
    border: "1px solid rgba(255, 255, 255, 0.2)"
  textarea:
    backgroundColor: "{colors.surface-low}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.md}"
    padding: "5px 10px"
    typography: "{typography.body-md}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "2px 14px"
  popup:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.lg}"
    padding: "4px 14px"
    width: 500px
  tag:
    backgroundColor: "{colors.surface-low}"
    textColor: "{colors.text-primary}"
    border: "1px solid rgba(255, 255, 255, 0.5)"
    rounded: "{rounded.md}"
    padding: "0.1rem 0.2rem"
  tag-actionable:
    rounded: "{rounded.pill}"
    size: "calc(1rem * 2)"
  chat-bubble:
    backgroundColor: "{colors.surface-low}"
    textColor: "{colors.text-primary}"
    padding: 10px
  scrollbar:
    width: 0.7rem
    thumbColor: "rgba(175, 175, 175, 0.7)"
    thumbBorder: "inset 0 0 0 1px rgba(0, 0, 0, 0.5)"
    rounded: "{rounded.lg}"
  status-dot:
    size: 14px
    rounded: "{rounded.pill}"
    successColor: "green"
    dangerColor: "red"
---

## Overview

EmberDesk is a self-hosted LLM frontend built for power users who live inside the application for hours. The design philosophy is **functional darkness** — a dense, low-fatigue workspace where every surface earns its place through utility, not ornamentation.

The visual identity is atmospheric and layered. Backgrounds use tinted blur overlays rather than flat solid colors, creating subtle depth that avoids monotony in a long-session tool. The palette is deliberately muted: near-black surfaces, ivory text, with color reserved for semantic meaning — amber for emphasis and quotes, soft green for underlines and success states, red for danger.

Density is a feature, not a compromise. Controls are compact because screen real estate is the scarcest resource in a multi-panel workspace. But density never sacrifices clarity — consistent spacing, a11y-aware focus rings, and hover opacity transitions keep the interface navigable at speed.

## Colors

The palette operates in two layers: **structural colors** define surfaces, borders, and shadows; **semantic colors** carry meaning.

Structural colors are near-neutral and low-contrast by design. The default surface is `#171717` — close to black but warm enough to avoid the clinical feel of pure `#000`. Body text is `#DCDCD2`, a muted ivory that reads comfortably against dark surfaces without the harshness of pure white. Secondary text at `#919191` and muted text at 70% opacity provide two tiers of de-emphasis for labels, timestamps, and metadata.

Semantic color is sparse and deliberate. Amber (`#E88A24`) marks in-line quotes and emphasis — it is the loudest color in the default theme and signals "someone is speaking." Soft green (`#BCE7CF`) marks underlines and success indicators. Red is reserved exclusively for destructive actions and error states, appearing as `rgba(255, 0, 0, 0.9)` for text and `rgba(100, 0, 0, 0.7)` for filled backgrounds.

The entire color system is overridable. Users can customize every semantic token via theme settings, and the built-in ThemeGenerator can algorithmically derive a palette from a background image using Oklch color math, enforcing WCAG contrast ratios automatically.

## Typography

Two font families cover all use cases. **Noto Sans** is the workhorse — clean, neutral, wide language support, and well-hinted at small sizes. **Noto Sans Mono** handles code blocks, terminal output, and technical labels.

The base font size is **15px**, scaled by a user-adjustable `--fontScale` multiplier. All other sizes derive from this single root, so a user who scales up for a HiDPI display or accessibility needs gets proportional scaling everywhere.

Weight usage is restrained: 400 for body text, 500 for emphasized body and labels, 600 for sub-headings, bold for true headings. The globally applied text shadow (`0px 0px Npx shadow`) gives text a slightly floating, soft-edged quality that reduces the harsh pixel-clarity feel of dense dark UIs — it is a deliberate aesthetic choice that also improves legibility against varied background images.

Line height follows a formula tied to font size (`calc(var(--mainFontSize) + 0.5rem)`), keeping text blocks breathable without wasting vertical space.

## Layout

The layout is a centered single-column workspace. The main chat shell (`#sheld`) occupies a user-configurable width (default `50vw`), centered in the viewport. A fixed top bar sits above, and a send form anchors the bottom. Side panels (character list, settings, extensions) overlay from the edges or replace the chat area depending on viewport width.

Spacing is deliberately tight. Gaps between interactive elements default to **5px**. Container padding is **10px** for most panels. The philosophy is: whitespace should exist where it aids scanning — between logically distinct groups — not as a blanket luxury margin.

The layout is responsive by necessity (multi-device self-hosting) but not mobile-first. Desktop is the primary environment; mobile layouts adapt via `@media` queries that stack panels vertically and adjust control sizes.

Panel shell containers are present in the initial HTML for instant first paint. Heavy inner content (settings sections, character cards) is deferred and rendered after the app-ready event, then state is replayed into late-loaded DOM.

## Elevation & Depth

EmberDesk creates depth through **blur overlays** rather than drop shadows or material-style elevation layers.

The blur system has two configurable variables: `--blurStrength` (default 10, controlling the `backdrop-filter: blur()` radius) and `--shadowWidth` (default 2, controlling the text shadow spread). The top bar, chat area, popup backdrop, and options menu all use `backdrop-filter: blur()` against a tinted background (`--SmartThemeBlurTintColor`), creating a frosted-glass effect that reveals the background image beneath.

Box shadows are minimal: `0 0 10px rgba(0, 0, 0, 0.5)` on popups and `0 2px 20px 0 rgba(0, 0, 0, 0.7)` on the top bar — enough to separate layers without competing with the blur system.

The shadow popup overlay (`#shadow_popup`) uses double the blur strength as a backdrop, creating a strong depth separation between the active modal and the dimmed workspace behind it.

## Shapes

Border radius follows a four-level scale:

- **2px** — avatars in default (square) mode
- **3px** — kbd elements, small inline items
- **5px** — buttons, inputs, tags, textareas, interactable controls
- **10px** — panels, popups, modals, scroll thumbs, code blocks, chat borders

The consistent use of 5px for interactive controls and 10px for container-level surfaces creates a subtle hierarchy: controls feel embedded; containers feel elevated.

Avatars have three shape modes: square (`2px`), rounded (`10px`), and round (`50%`), toggled by user preference.

## Components

**Buttons** (`menu_button`) are compact, bordered, and semi-transparent. Background is the surface tint with a 50% grayscale filter that lifts on hover to full brightness. The transition duration is 250ms. Disabled buttons reduce opacity to 0.5 and add `grayscale(0.5)`.

**Inputs and Textareas** share a consistent treatment: `rgba(0, 0, 0, 0.3)` background, 1px border in the theme border color, 5px radius. On focus, the border lightens to `rgba(255, 255, 255, 0.2)` — a subtle but visible focus indicator that works against both light and dark backgrounds.

**Tags** are inline pill-like labels with a semi-transparent background and 1px border. Actionable filter tags are circular (50% radius, aspect-ratio 1:1) and sized to `2x` the base font size for comfortable touch targets.

**Popups/Modals** use the `<dialog>` element, styled at 500px default width with 10px radius, surface-tint background, blur backdrop, and a `pop-in` entrance animation. Content is scrollable with `overflow-y: auto` inside the popup body.

**Chat Messages** (`.mes`) are full-width flex rows with 10px padding. Message text uses the body-lg weight (500) for a slightly heavier-than-default reading experience. Inline semantic markup is color-coded: `<em>`/`<i>` in the em color, `<q>` in quote amber, `<u>` in underline green. Code blocks use the mono font with a near-black background and 70% white text.

**Status indicators** are 14px circles: green for connected, red for disconnected. They appear in the online status bar with 4px left margin spacing from the label text.

## Do's and Don'ts

**Do:**
- Use blur overlays and tinted surfaces for depth — never flat solid-gray panels.
- Keep interactive controls at 5px radius; reserve 10px for container surfaces.
- Use opacity transitions (0.5 to 1.0) for hover states on icons and buttons.
- Use the semantic color tokens (amber for quotes, green for success, red for danger) consistently.
- Derive font sizes from `--mainFontSize` and the `--fontScale` multiplier.
- Provide `:focus-visible` outlines on all interactive elements — use the theme outline color, not browser defaults.
- Keep panel shells in initial HTML; defer heavy inner content.

**Don't:**
- Introduce bright or saturated accent colors beyond the established semantic set.
- Use large border radii (15px+) or heavy drop shadows — they fight the atmospheric blur aesthetic.
- Add decorative elements that consume vertical space without providing functional information.
- Use pure white (`#FFF`) for text — always use the ivory tone (`#DCDCD2`).
- Break the ID-based DOM integration pattern with framework component abstractions.
- Use fixed pixel values for font sizes — always derive from the scalable root.
