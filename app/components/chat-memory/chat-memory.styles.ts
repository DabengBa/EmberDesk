import * as stylex from '@stylexjs/stylex';

export const memoryStyles = stylex.create({
    panel: { width: '960px', color: 'var(--SmartThemeBodyColor, #e8e6df)', backgroundColor: 'var(--SmartThemeBlurTintColor, #222521)' },
    body: { display: 'flex', flexDirection: 'column', gap: '16px', overflowWrap: 'anywhere' },
    toolbar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
    row: { display: 'flex', flexDirection: 'column', gap: '8px', paddingBlock: '12px', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--SmartThemeBorderColor, #606459)', minWidth: 0 },
    text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, fontFamily: 'inherit', lineHeight: 1.6 },
    muted: { color: 'var(--SmartThemeFadedColor, #c1c3b9)', fontSize: '0.85rem', lineHeight: 1.5 },
    field: { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '8px', color: 'inherit', backgroundColor: 'var(--black50a, #171a17)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--SmartThemeBorderColor, #606459)', borderRadius: '4px', fontFamily: 'inherit' },
    toggle: { alignSelf: 'flex-start', margin: 0 },
    error: { padding: '10px', color: 'var(--SmartThemeBodyColor, #e8e6df)', borderInlineStartWidth: '3px', borderInlineStartStyle: 'solid', borderInlineStartColor: '#e9a58d' },
});
