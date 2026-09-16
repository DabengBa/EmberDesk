import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, '../..');

const APP_SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const CSS_IMPORT_RE = /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+\.css)['"]/g;

/**
 * Ordinary CSS imports allowed while the StyleX migration completes.
 * New entries must not be added; each entry is removed as its file is
 * converted to StyleX/Astryx.
 */
export const ALLOWED_CSS_IMPORTS = new Set([
    '@astryxdesign/core/astryx.css',
    './styles/settings-surface.css',
    '../styles/globals.css',
]);

function collectAppSourceFiles(directory, relativeDirectory = 'app') {
    if (!fs.existsSync(directory)) {
        return [];
    }
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'dist' || entry.name === 'node_modules') {
                return [];
            }
            return collectAppSourceFiles(absolutePath, relativePath);
        }
        return entry.isFile() && APP_SOURCE_EXTENSIONS.has(path.extname(entry.name))
            ? [relativePath]
            : [];
    });
}

export function collectDisallowedCssImports(root = repoRoot) {
    const appRoot = path.join(root, 'app');
    const violations = [];
    for (const relativePath of collectAppSourceFiles(appRoot)) {
        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        for (const match of source.matchAll(CSS_IMPORT_RE)) {
            if (!ALLOWED_CSS_IMPORTS.has(match[1])) {
                violations.push(`${relativePath}: ${match[1]}`);
            }
        }
    }
    return violations.sort();
}

const TAILWIND_UTILITY_RE = /className=\{?["'`][^"'`]*\b(?:p[trblxy]?-\d|m[trblxy]?-\d|text-(?:xs|sm|base|lg|xl|2xl)|font-(?:bold|medium|semibold)|bg-[a-z]+-\d{2,3}|rounded(?:-[a-z]+)?|items-[a-z]+|justify-[a-z]+|gap-\d|w-\d|h-\d)\b/;

export function collectTailwindUsage(root = repoRoot) {
    const appRoot = path.join(root, 'app');
    const violations = [];
    for (const relativePath of collectAppSourceFiles(appRoot)) {
        const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
        if (TAILWIND_UTILITY_RE.test(source)) {
            violations.push(relativePath);
        }
    }
    return violations.sort();
}
