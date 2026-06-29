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
        ],
        overrides: [
            {
                files: [
                    'app/workspace-panels.tsx',
                ],
                rules: [
                    'react-doctor/no-multi-comp',
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
                // This is the first-party debug menu template loaded by the
                // application, not a generated browser debug dump.
                files: [
                    'public/scripts/templates/debug.html',
                ],
                rules: [
                    'react-doctor/public-debug-artifact',
                ],
            },
            {
                // These endpoints already constrain paths through per-user
                // directory roots, sanitize-filename, strict filename
                // validators, readdir-derived names, or isPathUnderParent.
                files: [
                    'src/endpoints/assets.js',
                    'src/endpoints/avatars.js',
                    'src/endpoints/backgrounds.js',
                    'src/endpoints/backups.js',
                    'src/endpoints/characters.js',
                    'src/endpoints/chats.js',
                    'src/endpoints/extensions.js',
                    'src/endpoints/files.js',
                    'src/endpoints/groups.js',
                    'src/endpoints/images.js',
                    'src/endpoints/openai.js',
                    'src/endpoints/quick-replies.js',
                    'src/endpoints/settings.js',
                    'src/endpoints/stable-diffusion.js',
                    'src/endpoints/themes.js',
                    'src/endpoints/users-private.js',
                    'src/endpoints/vectors.js',
                    'src/endpoints/worldinfo.js',
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
                    'src/endpoints/backends/chat-completions.js',
                    'src/endpoints/novelai.js',
                    'src/endpoints/openai.js',
                    'src/endpoints/stable-diffusion.js',
                ],
                rules: [
                    'react-doctor/request-body-mass-assignment',
                ],
            },
        ],
    },
};
