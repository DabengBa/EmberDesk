export function installPublicBrowserApi({ getContext }) {
    globalThis.SillyTavern = { getContext };
}
