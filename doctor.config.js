export default {
    $schema: 'https://react.doctor/schema.json',
    deadCode: false,
    noScore: true,
    ignore: {
        tags: [
            'test-noise',
            'migration-hint',
        ],
        files: [
            'public/lib/**',
            'public/scripts/extensions/**',
            'artifacts/**',
            'data/**',
        ],
        overrides: [
            {
                files: [
                    'app/workspace-panels.tsx',
                ],
                rules: [
                    'react-doctor/no-multi-component-file',
                    'react-doctor/only-export-components',
                ],
            },
            {
                // React replays HTML that was produced by the legacy formatter
                // and DOMPurify path; replacing it with text would break the
                // protected rich-message and slash-command compatibility DOM.
                files: [
                    'app/workspace-panels.tsx',
                    'public/script.js',
                ],
                rules: [
                    'react-doctor/dangerous-html-sink',
                ],
            },
            {
                // These endpoints already constrain paths through per-user
                // directory roots, sanitize-filename, strict filename
                // validators, readdir-derived names, or isPathUnderParent.
                files: [
                    'src/endpoints/assets.ts',

                    'src/endpoints/backups.ts',
                    'src/endpoints/characters.ts',
                    'src/endpoints/chats.ts',

                    'src/endpoints/files.ts',

                    'src/endpoints/images.ts',
                    'src/endpoints/openai.ts',

                ],
                rules: [
                    'react-doctor/path-traversal-risk',
                ],
            },
            {
                // Provider routes intentionally forward caller-selected model
                // and generation fields to external APIs after route-specific
                // normalization, secret lookup, and endpoint selection.
                files: [

                    'src/endpoints/openai.ts',
                ],
                rules: [
                    'react-doctor/request-body-mass-assignment',
                ],
            },
        ],
    },
};
