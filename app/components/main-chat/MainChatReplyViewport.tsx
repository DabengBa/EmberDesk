import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslated } from '../../compat/i18n.js';

export function MainChatReplyViewport({
    questionId, replyId, questionUid, replyUid, finished,
}: {
    questionId: string;
    replyId: string | null;
    questionUid: string | undefined;
    replyUid: string | undefined;
    finished: boolean;
}) {
    const following = useRef(true);
    const seenReply = useRef(false);
    const jump = useRef<() => void>(undefined);
    const [showJump, setShowJump] = useState(false);
    const jumpLabel = useTranslated('View new reply');

    useLayoutEffect(() => {
        const chat = document.getElementById('chat');
        const rowFor = (id: string) => chat?.querySelector<HTMLElement>(`:scope > .mes[mesid="${CSS.escape(id)}"]`);
        const question = rowFor(questionId);
        const reply = replyId === null ? null : rowFor(replyId);
        if (!chat || !question) return;
        chat.toggleAttribute('data-reply-viewport-following', following.current);
        let expectedTop = chat.scrollTop;
        const viewportTop = () => chat.getBoundingClientRect().top + chat.clientTop;

        function updateJump() {
            if (!chat || !reply || !finished || seenReply.current) {
                setShowJump(false);
                return;
            }
            const start = reply.getBoundingClientRect().top - viewportTop();
            if (start >= -2 && start < chat.clientHeight - 24) seenReply.current = true;
            setShowJump(!following.current && !seenReply.current);
        }

        function reveal() {
            if (!chat || !question || !following.current) return;
            const end = (reply ?? question).getBoundingClientRect();
            const start = question.getBoundingClientRect().top;
            const top = viewportTop();
            const bottom = top + chat.clientHeight;
            if (end.bottom - start > chat.clientHeight) {
                // The reply can continue below the fold. Put its opening in view.
                chat.scrollTop += end.top - top - 8;
            } else if (start < top) {
                chat.scrollTop += start - top;
            } else if (end.bottom > bottom) {
                chat.scrollTop += end.bottom - bottom;
            }
            expectedTop = chat.scrollTop;
        }

        function refresh() {
            reveal();
            updateJump();
        }

        function onScroll() {
            if (!chat) return;
            // An external scroll (wheel, touch, keyboard, scrollbar) takes over.
            // Clamping an earlier position after content shrinks is not a gesture.
            const clamped = Math.min(expectedTop, chat.scrollHeight - chat.clientHeight);
            if (following.current && Math.abs(chat.scrollTop - clamped) > 2) {
                following.current = false;
                chat.removeAttribute('data-reply-viewport-following');
            }
            updateJump();
        }

        jump.current = () => {
            if (!reply) return;
            following.current = true;
            seenReply.current = true;
            chat.setAttribute('data-reply-viewport-following', '');
            // Explicit jumps go to the reply opening, including for short turns.
            chat.scrollTop += reply.getBoundingClientRect().top - viewportTop() - 8;
            expectedTop = chat.scrollTop;
            if (!reply.hasAttribute('tabindex')) reply.tabIndex = -1;
            reply.focus({ preventScroll: true });
            setShowJump(false);
        };
        const observer = new ResizeObserver(refresh);
        observer.observe(chat);
        observer.observe(question);
        if (reply) observer.observe(reply);
        chat.addEventListener('scroll', onScroll, { passive: true });
        refresh();

        return () => {
            jump.current = undefined;
            observer.disconnect();
            chat.removeEventListener('scroll', onScroll);
            chat.removeAttribute('data-reply-viewport-following');
        };
    }, [questionId, replyId, questionUid, replyUid, finished]);

    const actions = showJump ? document.getElementById('chat_reply_actions') : null;
    return actions && createPortal(
        <button type="button" id="chat_show_new_reply" className="menu_button" onClick={() => jump.current?.()}>
            <i className="fa-solid fa-arrow-down" aria-hidden="true" />
            {jumpLabel}
        </button>,
        actions,
    );
}
