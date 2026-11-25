// Embedded cards reserve explicit ids before assigning ids to entries without one.
export function getCharacterBookEntryIds(entries) {
    const used = new Set(entries.filter(entry => entry.id !== undefined).map(entry => String(entry.id)));
    let next = 0;
    return entries.map(entry => {
        if (entry.id !== undefined) return entry.id;
        while (used.has(String(next))) next++;
        return next++;
    });
}
