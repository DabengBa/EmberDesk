import * as stylex from '@stylexjs/stylex';

export const composerStyles = stylex.create({
    /**
     * Idle-hidden control. Class-level (not !important) so legacy jQuery
     * `.css('display', …)` inline writes — showStopButton/hideStopButton —
     * still override it.
     */
    idleHidden: {
        display: 'none',
    },
});
