# Task 01 Evidence — Character/Group full field coverage

## Commands
- `bun run --cwd tests test:unit -- character-authoring-facade.test.js group-authoring-facade.test.js react-workspace-panels-helpers.test.js --runInBand`

## Result
- PASS 3 suites / 45 tests
- React authoring panel now exposes character fields: name, avatar, favorite, description, firstMessage, alternateGreetings, personality, scenario, exampleMessages, systemPrompt, postHistoryInstructions, creatorNotes, creator, characterVersion, tags, characterWorld, talkativeness, depthPrompt.{prompt,depth,role}
- Group fields: name, avatarUrl, favorite, allowSelfResponses, hideMutedSprites, activationStrategy, generationMode, autoModeDelay, joinPrefix, joinSuffix, members with non-drag reorder
- Unsupported extension warning no longer routes users to legacy editor

## Summary
Field coverage inventory implemented in `AuthoringWorkspacePanel`. Depth prompt role normalization accepts string roles (`system|user|assistant`) from create-state and card extensions. No legacy-only edit exit remains for supported fields.
