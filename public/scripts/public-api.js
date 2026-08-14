export function installPublicBrowserApi({ libs, getContext }) {
    globalThis.SillyTavern = {
        libs,
        getContext,
    };
}
