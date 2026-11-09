/** Tracks only character-sort changes, without changing the settings save scheduler. */
export function createSortSaveGuard(target) {
    let version = 0;
    let pending = false;
    let latestSuccess = null;
    let ambiguous = false;
    const active = new Set();

    function beforeUnload(event) {
        event.preventDefault();
        event.returnValue = true;
    }

    return {
        changed() {
            version++;
            if (!pending) target.addEventListener('beforeunload', beforeUnload);
            pending = true;
        },
        begin(expectedRevision) {
            const save = { version, expectedRevision, overlapped: active.size > 0 };
            if (save.overlapped) for (const other of active) other.overlapped = true;
            active.add(save);
            return save;
        },
        finish(save, revision) {
            active.delete(save);
            // undefined means failure; null is a successful legacy response with no revision.
            if (revision !== undefined) {
                if (revision === null && save.overlapped) ambiguous = true;
                if (!save.overlapped) ambiguous = false;
                if (revision !== null && (!latestSuccess || latestSuccess.revision === null || revision > latestSuccess.revision)) {
                    latestSuccess = { version: save.version, revision };
                } else if (revision === null && !save.overlapped) {
                    latestSuccess = { version: save.version, revision };
                    ambiguous = false;
                }
            }
            // The canonical endpoint uses compare-and-swap. An in-flight request
            // based on an older revision can no longer overwrite this success.
            const blocking = [...active].some(request =>
                latestSuccess?.revision == null || !Number.isSafeInteger(request.expectedRevision)
                || request.expectedRevision < 0 || request.expectedRevision >= latestSuccess.revision);
            if (pending && !blocking && !ambiguous && latestSuccess?.version === version) {
                pending = false;
                target.removeEventListener('beforeunload', beforeUnload);
            }
        },
    };
}

let guard;
function getGuard() {
    return guard ??= createSortSaveGuard(window);
}
export const markCharacterSortChanged = () => getGuard().changed();
export const beginSettingsSaveSnapshot = revision => getGuard().begin(revision);
export const finishSettingsSaveSnapshot = (save, revision) => getGuard().finish(save, revision);
