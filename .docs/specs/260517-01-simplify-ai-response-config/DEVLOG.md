# Simplify AI Response Configuration

## Summary

精简 AI Response Configuration 面板，移除 3 个当前实现中未使用的采样参数（Repetition Penalty / Min P / Top A），将 7 个小众设置（Streaming / Frequency Penalty / Presence Penalty / Top K / Multiple swipes / Seed / Logit Bias）移入「Advanced Sampling」折叠区，将 10 个 Utility Prompts 移入「Advanced Prompts」折叠区，移除 Unlocked Context Size 开关。

## Changes

### Removed (HTML + JS + preset fields)
- Repetition Penalty (`#repetition_penalty_openai`)
- Min P (`#min_p_openai`)
- Top A (`#top_a_openai`)

### Moved to Advanced Sampling drawer
- Streaming, Frequency Penalty, Presence Penalty, Top K, Multiple swipes, Seed, Logit Bias

### Moved to Advanced Prompts drawer
- Impersonation / World Info / Scenario / Personality / Group Nudge / New Chat / New Group Chat / New Example Chat / Continue nudge / Replace empty message

### UI Simplification
- Removed Unlocked Context Size checkbox (Context Size max stays at 4095)
- First screen: 5 interactive controls (Presets / Context Size / Max Response Length / Temperature / Top P)

## Files Modified

- `public/index.html` — DOM restructuring: removed 3 range-blocks, removed 1 checkbox, created 2 inline-drawer sections, moved controls
- `public/scripts/openai.js` — Removed 3 entries from `settingsToUpdate`, 3 entries from `default_settings`, 3 event handlers

## Design Decisions

- Streaming default value kept as `false` (no behavior change, UI position only)
- Context Size max kept at 4095, JS unlock logic preserved (only UI checkbox removed)
- API request construction untouched (removed params were already not sent)
- Used existing `.inline-drawer` component for new drawers (no new CSS)
