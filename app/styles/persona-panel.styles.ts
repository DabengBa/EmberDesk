import * as stylex from '@stylexjs/stylex';

export const personaPanelStyles = stylex.create({
    avatarBlock: {
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        padding: 1,
        gap: 10,
    },
    avatarUpload: {
        cursor: 'pointer',
        width: 60,
        height: 60,
        background: 'var(--grey30)',
        borderRadius: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '3rem',
    },
    personaName: {
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        fontSize: 'calc(var(--mainFontSize) * 1.25)',
        opacity: 0.5,
    },
    connectionsButtons: {
        marginBottom: 5,
    },
});
