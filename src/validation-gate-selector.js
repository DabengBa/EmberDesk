const ADVISORY_NOTE = 'Advisory only: final diff review may add or remove validation based on actual changes.';

const RULES = [
    {
        id: 'frontend-compatibility',
        required: true,
        command: 'bun run test:compat',
        reason: 'Frontend compatibility, regex, slash-command, extension, or protected DOM surface changed.',
        sources: [
            'AGENTS.md',
            '.docs/tech/third-party-extension-compatibility.md',
            '.docs/tech/bun-workflow.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^public\/scripts\/slash-commands\.js$/,
                /^public\/scripts\/extensions\//,
                /^public\/scripts\/templates\//,
                /^public\/index\.html$/,
                /^(frontend compatibility|regex|regex extension|slash command|slash commands|extension surface|third-party extension|tavern-helper)$/i,
            ]);
        },
    },
    {
        id: 'react-workspace-panels',
        required: true,
        command: 'bun run --cwd tests test:unit -- react-workspace-panels-helpers.test.js workspace-react-panel-flags.test.js --runInBand',
        reason: 'React workspace panel bridge, host lifecycle, or guarded panel flag surface changed.',
        sources: [
            '.docs/tech/react-modernization-roadmap.md',
            '.docs/tech/bun-workflow.md',
            '.docs/tech/third-party-extension-compatibility.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^app\/workspace-panels\.tsx$/,
                /^public\/scripts\/workspace-panel/,
                /^public\/scripts\/workspace-panels-react-bridge\.js$/,
                /^src\/workspace-react-features\.js$/,
                /^default\/config\.yaml$/,
                /^tests\/react-workspace-panels-helpers\.test\.js$/,
                /^tests\/workspace-react-panel-flags\.test\.js$/,
                /^(react workspace panel|react workspace panels|workspace panel host|workspace panel bridge)$/i,
            ]);
        },
    },
    {
        id: 'react-workspace-panel-bundle',
        required: false,
        command: 'bun run build:react:workspace-panels',
        reason: 'Workspace panel bundle entry or React panel implementation changed.',
        sources: [
            '.docs/tech/bun-workflow.md',
            'package.json',
            'tests/playwright.config.js',
        ],
        matches(input) {
            return matchesAny(input, [
                /^app\/workspace-panels\.tsx$/,
                /^vite\.config\./,
                /^package\.json$/,
                /^tests\/playwright\.config\.js$/,
                /^(workspace-panels bundle|workspace panel bundle|react workspace panel bundle)$/i,
            ]);
        },
    },
    {
        id: 'express-route-order',
        required: true,
        command: 'bun run --cwd tests test:unit -- express5-route-compatibility.test.js --runInBand',
        reason: 'Express route, middleware order, or route compatibility surface changed.',
        sources: [
            'AGENTS.md',
            '.docs/adr/0010-express-runtime-owner-boundary.md',
            '.docs/adr/0008-hono-route-island-under-express-host.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^src\/endpoints\//,
                /^src\/middleware\//,
                /^src\/express-route-compat\.js$/,
                /^src\/server-main\.js$/,
                /^(express route|express routes|middleware order|route order)$/i,
            ]);
        },
    },
    {
        id: 'startup-config',
        required: true,
        command: 'bun run --cwd tests test:unit -- command-line.test.js startup-critical-path.test.js startup-loader.test.js --runInBand',
        reason: 'Startup, config resolution, server boot, or command-line parsing changed.',
        sources: [
            'AGENTS.md',
            '.docs/tech/config-resolution.md',
            '.docs/tech/modernization-roadmap.md',
            '.docs/adr/0002-config-resolution-three-phase-split.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^server\.js$/,
                /^src\/command-line\.js$/,
                /^src\/server-startup\.js$/,
                /^src\/server-main\.js$/,
                /^src\/startup/,
                /^default\/config\.yaml$/,
                /^(startup|startup\/config|startup config|config resolution|command-line|server boot)$/i,
            ]);
        },
    },
    {
        id: 'user-auth-storage',
        required: true,
        command: 'bun run --cwd tests test:unit -- user-auth.test.js user-storage.test.js user-directories.test.js user-migrations.test.js --runInBand',
        reason: 'User auth, storage, directory, or migration surface changed.',
        sources: [
            'AGENTS.md',
            '.docs/adr/0003-user-account-module-split.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^src\/user-auth\.js$/,
                /^src\/user-storage\.js$/,
                /^src\/user-directories\.js$/,
                /^src\/user-migrations\.js$/,
                /^src\/users\.js$/,
                /^(user auth|user storage|user directories|user migrations|auth storage)$/i,
            ]);
        },
    },
    {
        id: 'canonical-storage-rollout',
        required: true,
        command: 'bun run --cwd tests test:unit -- canonical-sqlite-cli.test.js canonical-sqlite-operator.test.js canonical-sqlite-rollout-contract.test.js canonical-sqlite-shadow-import.test.js character-read-service.test.js character-write-service.test.js --runInBand',
        reason: 'Canonical SQLite repair tooling, rollout contract, rollback blockers, or DB-first storage authority changed.',
        sources: [
            '.docs/adr/0011-canonical-per-user-sqlite-storage.md',
            '.docs/tech/canonical-sqlite-storage-roadmap.md',
            '.docs/specs/260707-07-canonical-sqlite-repair-rollout-contract/spec.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^src\/canonical-sqlite(?:-|\.js)/,
                /^src\/canonical-sqlite-rollout-contract\.js$/,
                /^src\/canonical-sqlite-operator\.js$/,
                /^src\/storage-feature-flags\.js$/,
                /^src\/endpoints\/character-read-service\.js$/,
                /^src\/endpoints\/character-write-service\.js$/,
                /^src\/endpoints\/character-store\.js$/,
                /^src\/endpoints\/characters\.js$/,
                /^scripts\/canonical-sqlite-(?:audit|repair)\.mjs$/,
                /^tests\/canonical-sqlite-(?:cli|operator|rollout-contract|shadow-import|migrations|test)\.test\.js$/,
                /^tests\/character-read-service\.test\.js$/,
                /^tests\/character-write-service\.test\.js$/,
                /^\.docs\/tech\/canonical-sqlite-storage-roadmap\.md$/,
                /^\.docs\/adr\/0011-canonical-per-user-sqlite-storage\.md$/,
                /^(canonical sqlite|canonical storage|repair tooling|repair tool|rollout contract|rollback blocker|projection repair|shadow import|db-first reads|db-first writes)$/i,
            ]);
        },
    },
    {
        id: 'derived-cache',
        required: true,
        command: 'bun run --cwd tests test:unit -- derived-cache-sqlite.test.js interaction-performance-index.test.js --runInBand',
        reason: 'Derived SQLite helper, retired character-index helper, or historical interaction performance cache proof changed.',
        sources: [
            '.docs/adr/0009-derived-cache-sqlite-drizzle-decision.md',
            '.docs/tech/derived-cache-sqlite.md',
            '.docs/tech/interaction-performance-indexing.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^src\/derived-cache-sqlite\.js$/,
                /^src\/endpoints\/character-index\.js$/,
                /^scripts\/interaction-performance-runner\.mjs$/,
                /^\.docs\/tech\/derived-cache-sqlite\.md$/,
                /^\.docs\/tech\/interaction-performance-indexing\.md$/,
                /^(derived cache|character-index|character index|interaction performance index|derived index retirement|legacy-mode character index)$/i,
            ]);
        },
    },
    {
        id: 'shared-lib',
        required: true,
        command: 'bun run --cwd tests test:unit -- frontend-shared-library-boundary.test.js --runInBand',
        reason: 'Shared /lib.js source or browser compatibility boundary changed.',
        sources: [
            '.docs/tech/frontend-shared-library-boundary.md',
            '.docs/tech/bun-workflow.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^public\/lib\.js$/,
                /^webpack\.config\.js$/,
                /^\/?lib\.js$/i,
                /^(shared library|shared browser library)$/i,
            ]);
        },
    },
    {
        id: 'semantic-docs',
        required: true,
        command: 'bun run docs:check',
        reason: 'Semantic documentation database changed.',
        sources: [
            'AGENTS.md',
            '.docs/db/scripts/doc-compiler.js',
            '.docs/tech/modernization-roadmap.md',
        ],
        matches(input) {
            return matchesAny(input, [
                /^\.docs\/db\//,
                /^(semantic docs|semantic documentation|docs database)$/i,
            ]);
        },
    },
];

/**
 * @param {string[]} inputs
 */
export function selectValidationGates(inputs) {
    const normalizedInputs = [...new Set((inputs ?? [])
        .map(input => String(input ?? '').trim())
        .filter(Boolean)
        .map(normalizePathLikeInput))];
    const selected = [];

    for (const rule of RULES) {
        const matchedInputs = normalizedInputs.filter(input => rule.matches(input));
        if (matchedInputs.length === 0) {
            continue;
        }

        selected.push({
            id: rule.id,
            command: rule.command,
            required: rule.required,
            reason: rule.reason,
            sources: rule.sources,
            matchedInputs,
        });
    }

    return {
        advisoryOnly: true,
        inputs: normalizedInputs,
        commands: dedupeCommands(selected),
        notes: [ADVISORY_NOTE],
    };
}

/**
 * @param {ReturnType<typeof selectValidationGates>} selection
 */
export function formatValidationGateSelection(selection) {
    const notes = selection?.notes ?? [ADVISORY_NOTE];
    const lines = [
        'Validation Gate Selector (advisory-only)',
        '',
    ];

    if (!selection?.commands?.length) {
        lines.push('- No focused gates matched. Use final diff review to choose validation.');
    } else {
        for (const command of selection.commands) {
            lines.push([
                `- [${command.required ? 'required' : 'optional'}] ${command.command}`,
                `  reason: ${command.reason}`,
                `  sources: ${command.sources.join(', ')}`,
                `  matched: ${command.matchedInputs.join(', ')}`,
            ].join('\n'));
        }
    }

    lines.push('', ...notes.map(note => `Note: ${note}`));
    return `${lines.join('\n')}\n`;
}

/**
 * @param {string} input
 */
function normalizePathLikeInput(input) {
    return input.replaceAll('\\', '/').replace(/^\.\//, '');
}

/**
 * @param {string} input
 * @param {RegExp[]} patterns
 */
function matchesAny(input, patterns) {
    return patterns.some(pattern => pattern.test(input));
}

/**
 * @param {Array<{
 *   id: string,
 *   command: string,
 *   required: boolean,
 *   reason: string,
 *   sources: string[],
 *   matchedInputs: string[],
 * }>} selected
 */
function dedupeCommands(selected) {
    const byCommand = new Map();

    for (const command of selected) {
        const existing = byCommand.get(command.command);
        if (!existing) {
            byCommand.set(command.command, {
                ...command,
                sources: [...command.sources],
                matchedInputs: [...command.matchedInputs],
            });
            continue;
        }

        existing.required ||= command.required;
        existing.sources = [...new Set([...existing.sources, ...command.sources])];
        existing.matchedInputs = [...new Set([...existing.matchedInputs, ...command.matchedInputs])];
    }

    return [...byCommand.values()];
}
