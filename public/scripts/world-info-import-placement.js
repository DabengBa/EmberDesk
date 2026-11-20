/** Route imported entries through the preset's World Info marker by default. */
export function setImportedWorldInfoPositions(entries) {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;

    for (const entry of Object.values(entries)) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
            entry.position = 0; // World Info placement
        }
    }
}
