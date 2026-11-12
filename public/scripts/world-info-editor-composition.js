/** Own the one editor session and synchronize its live shell inputs on access. */
export function createWorldInfoEditorComposition({ getWorldNames, getSelectedWorldInfo, createSession, getSessionOptions = () => ({}) }) {
    let session = null;
    return function getWorldInfoWorkbenchSession() {
        const worldNames = getWorldNames();
        const selectedWorldInfo = getSelectedWorldInfo();
        const names = Array.isArray(worldNames) ? worldNames : [];
        const selected = Array.isArray(selectedWorldInfo) ? selectedWorldInfo : [];
        if (!session) {
            session = createSession({ ...getSessionOptions(), worldNames: names, selectedWorldInfo: selected });
        }
        session.setWorldNames(names);
        session.setSelectedWorldInfo(selected);
        return session;
    };
}
