import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(contractName, message) {
    throw new Error(`${contractName}: ${message}`);
}

export function readRepoFile(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function getTagByClass(html, className, { contractName = `class ${className}` } = {}) {
    const escaped = escapeRegExp(className);
    const tagPattern = new RegExp(`<[^>]*\\bclass="[^"]*\\b${escaped}\\b[^"]*"[^>]*>`);
    const match = html.match(tagPattern);

    if (!match) {
        fail(contractName, `expected a tag with class "${className}"`);
    }

    return match[0];
}

export function getTagById(html, id, { contractName = `id ${id}` } = {}) {
    const escaped = escapeRegExp(id);
    const tagPattern = new RegExp(`<[^>]*\\bid="${escaped}"[^>]*>`);
    const match = html.match(tagPattern);

    if (!match) {
        fail(contractName, `expected a tag with id "${id}"`);
    }

    return match[0];
}

export function expectButtonAffordance(tag, label, { contractName = label } = {}) {
    if (!/\brole="button"/.test(tag)) {
        fail(contractName, 'expected role="button"');
    }
    if (!/\btabindex="0"/.test(tag)) {
        fail(contractName, 'expected tabindex="0"');
    }
    if (!new RegExp(`\\baria-label="${escapeRegExp(label)}"`).test(tag)) {
        fail(contractName, `expected aria-label="${label}"`);
    }
}

export function expectContainsMarkers(source, markers, { contractName = 'source markers' } = {}) {
    for (const marker of markers) {
        if (!source.includes(marker)) {
            fail(contractName, `expected marker ${marker}`);
        }
    }
}

export function expectNotContainsMarkers(source, markers, { contractName = 'source markers' } = {}) {
    for (const marker of markers) {
        if (source.includes(marker)) {
            fail(contractName, `unexpected marker ${marker}`);
        }
    }
}

export function expectDocumentOrder(source, orderedMarkers, { contractName = 'document order' } = {}) {
    let previousIndex = -1;

    for (const marker of orderedMarkers) {
        const index = source.indexOf(marker);
        if (index === -1) {
            fail(contractName, `missing ordered marker ${marker}`);
        }
        if (index <= previousIndex) {
            fail(contractName, `marker ${marker} is not after the previous marker`);
        }
        previousIndex = index;
    }
}

export function expectUniqueMarker(source, marker, { contractName = marker } = {}) {
    const firstIndex = source.indexOf(marker);
    if (firstIndex === -1) {
        fail(contractName, `missing unique marker ${marker}`);
    }

    const secondIndex = source.indexOf(marker, firstIndex + marker.length);
    if (secondIndex !== -1) {
        fail(contractName, `marker ${marker} appears more than once`);
    }
}
