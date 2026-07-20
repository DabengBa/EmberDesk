const CHARACTER_LIBRARY_GRID_CARD_MIN_WIDTH = 104;
const CHARACTER_LIBRARY_GRID_GAP = 8;
const CHARACTER_LIBRARY_GRID_MAX_COLUMNS = 3;

export function getCharacterLibraryGridColumnCount(containerWidth) {
    const width = Number(containerWidth);
    if (!Number.isFinite(width) || width <= 0) {
        return 1;
    }

    const availableColumns = Math.floor(
        (width + CHARACTER_LIBRARY_GRID_GAP)
        / (CHARACTER_LIBRARY_GRID_CARD_MIN_WIDTH + CHARACTER_LIBRARY_GRID_GAP),
    );
    return Math.min(CHARACTER_LIBRARY_GRID_MAX_COLUMNS, Math.max(1, availableColumns));
}

export function getCharacterLibraryGridRowCount(itemCount, columnCount) {
    const count = Math.max(0, Number(itemCount) || 0);
    const columns = Math.max(1, Number(columnCount) || 1);
    return Math.ceil(count / columns);
}

export function getCharacterLibraryGridRowRange(rowIndex, columnCount) {
    const columns = Math.max(1, Number(columnCount) || 1);
    const start = Math.max(0, Number(rowIndex) || 0) * columns;
    return { start, end: start + columns };
}
