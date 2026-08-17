import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, '../..');

const APP_SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const LEGACY_RUNTIME_PROVIDER_RE = /(?:^|\/)public\/(?:script\.js|scripts\/(?:events|public-api)\.js)$/;

function collectAppSourceFiles(directory, relativeDirectory = 'app') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.posix.join(relativeDirectory, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'dist' || relativePath === 'app/compat' || relativePath.startsWith('app/compat/')) {
                return [];
            }
            return collectAppSourceFiles(absolutePath, relativePath);
        }

        return entry.isFile() && APP_SOURCE_EXTENSIONS.has(path.extname(entry.name))
            ? [relativePath]
            : [];
    });
}

function lineNumberAt(source, index) {
    return source.slice(0, index).split('\n').length;
}

function collectPatternViolations(relativePath, source, pattern, kind) {
    const violations = [];
    for (const match of source.matchAll(pattern)) {
        violations.push({
            file: relativePath,
            kind,
            line: lineNumberAt(source, match.index ?? 0),
        });
    }
    return violations;
}

function collectLegacyRuntimeProviderImports(relativePath, source) {
    const violations = [];
    const importPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g;

    for (const match of source.matchAll(importPattern)) {
        if (LEGACY_RUNTIME_PROVIDER_RE.test(match[1])) {
            violations.push({
                file: relativePath,
                kind: 'legacy-runtime-provider-import',
                line: lineNumberAt(source, match.index ?? 0),
                specifier: match[1],
            });
        }
    }

    return violations;
}

export function collectReactRuntimeBoundaryViolations(root = repoRoot) {
    const appRoot = path.join(root, 'app');
    const violations = [];

    for (const relativePath of collectAppSourceFiles(appRoot)) {
        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        violations.push(
            ...collectPatternViolations(relativePath, source, /globalThis\.SillyTavern\b/g, 'legacy-global-read'),
            ...collectPatternViolations(relativePath, source, /\bSillyTavern\s*(?:\?\.)?\.?getContext\s*\(/g, 'legacy-context-read'),
            ...collectPatternViolations(relativePath, source, /\bgetContext\s*\(/g, 'legacy-context-read'),
            ...collectPatternViolations(relativePath, source, /\beventSource\b/g, 'legacy-event-source-read'),
            ...collectPatternViolations(relativePath, source, /\bevent_types\b/g, 'legacy-event-types-read'),
            ...collectLegacyRuntimeProviderImports(relativePath, source),
        );
    }

    return violations.sort((left, right) => (
        left.file.localeCompare(right.file)
        || left.line - right.line
        || left.kind.localeCompare(right.kind)
    ));
}

export function collectGenericReactDispatchViolations(root = repoRoot) {
    const violations = [];
    const appRoot = path.join(root, 'app');

    for (const relativePath of collectAppSourceFiles(appRoot)) {
        if (relativePath.startsWith('app/compat/')) {
            continue;
        }

        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        violations.push(
            ...collectPatternViolations(relativePath, source, /\bdispatchAction\b/g, 'generic-react-dispatch'),
        );
    }

    const hostControllerRelativePath = 'public/scripts/workspace-panel-host-controller.js';
    const hostControllerSource = fs.readFileSync(path.join(root, hostControllerRelativePath), 'utf8');
    violations.push(
        ...collectPatternViolations(
            hostControllerRelativePath,
            hostControllerSource,
            /\bcreateWorkspacePanelActionBridge\b|\bdispatchAction\b/g,
            'generic-react-dispatch',
        ),
    );

    const scriptRelativePath = 'public/script.js';
    const scriptSource = fs.readFileSync(path.join(root, scriptRelativePath), 'utf8');
    violations.push(
        ...collectPatternViolations(
            scriptRelativePath,
            scriptSource,
            /\bcreateWorkspacePanelActionBridge\b|\bdispatchAction\(action\b/g,
            'generic-react-dispatch',
        ),
    );

    return violations.sort((left, right) => (
        left.file.localeCompare(right.file)
        || left.line - right.line
        || left.kind.localeCompare(right.kind)
    ));
}
