/** Publish a quiet-to-loud result through the caller's existing chat ports. */
export async function publishQuietToLoud({ reply, ownsRun, getChat, transform, createMessage, markTainted, emitSent, render, emitRendered, save }) {
    const chat = getChat();
    const isCurrent = () => ownsRun() && getChat() === chat;
    if (!isCurrent()) return;
    const text = await transform(reply);
    if (!isCurrent()) return;
    const message = createMessage(text);
    markTainted();
    chat.push(message);
    const index = chat.length - 1;
    await emitSent(index);
    if (!isCurrent()) return;
    render(message);
    await emitRendered(index);
    if (!isCurrent()) return;
    await save(isCurrent);
}
