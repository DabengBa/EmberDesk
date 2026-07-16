# Task 01 Evidence — React owns list presentation and compatible rows

## Commands
- `bun run --cwd tests test:unit -- character-library-row-helpers.test.js character-library-react-helpers.test.js character-list-structure.test.js character-read-service.test.js --runInBand`
- `bun run test:compat`
- `bun run build:react:character-library`

## Result
- PASS focused unit + compat
- React panel owns character/group/folder/back/empty/hidden rows with protected selectors
- List path always calls `renderCharacterListPageReact`; no jQuery full/incremental list fallback
- Build green

## Summary
Query/filter/sort still reuse existing entitiesFilter + printCharacters pagination data source; React is sole producer of visible compatible rows and list chrome host.
