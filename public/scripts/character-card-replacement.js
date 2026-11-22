/** Keep a delayed file or URL replacement scoped to the card that opened it. */
export async function replaceCharacterCard(target, replace, getCurrent, reopen) {
    const saved = await replace(target.avatar);
    const isCurrent = () => {
        const current = getCurrent();
        return current.avatar === target.avatar && current.chat === target.chat && current.session === target.session;
    };
    if (saved && isCurrent()) {
        await reopen(target.chat, isCurrent);
    }
    return saved;
}
