/**
 * One adapter for the React list. It owns no DOM or selection state; the
 * existing engine and popup controllers still own execution and persistence.
 */
export function createRegexListBridge({ capture, read, save, authorize, confirm, edit, exportScripts, afterChange }) {
    let snapshot = { groups: [] };
    let targets = new Map();
    const listeners = new Set();
    let busy = false;

    function refresh() {
        const nextTargets = new Map();
        const groups = [0, 2, 1].map(type => {
            let target;
            try { target = capture(type); } catch { /* No selected character/preset. */ }
            const key = type === 0 ? 'global' : type === 1
                ? `character:${target?.avatar ?? ''}` : `preset:${JSON.stringify([target?.apiId, target?.name])}`;
            if (!target) return { type, key, available: false, rules: [] };
            nextTargets.set(key, target);
            const rules = read(target).map(rule => {
                rule.id ||= crypto.randomUUID();
                return { id: rule.id, scriptName: rule.scriptName, disabled: Boolean(rule.disabled) };
            });
            return { type, key, available: true, rules };
        });
        targets = nextTargets;
        snapshot = { groups };
        listeners.forEach(listener => listener());
    }

    function requireTarget(key) {
        const target = targets.get(key);
        if (!target) throw new Error('Regex target changed; select the rule again');
        return target;
    }

    function requireRule(target, id) {
        const matches = read(target).filter(rule => rule.id === id);
        if (matches.length !== 1) throw new Error('Regex rule changed or no longer exists');
        return matches[0];
    }

    /**
     * Tag a rejected write with the stage that failed and the bound target's
     * group key. The React side only clears a failure when a later successful
     * action actually completed that stage for that target — a save-only
     * success must not clear an unresolved authorization failure.
     */
    async function attempt(work, stage, groupKey) {
        try {
            return await work();
        } catch (error) {
            if (error && typeof error === 'object') {
                error.stage ??= stage;
                error.groupKey ??= groupKey;
            }
            throw error;
        }
    }

    function conflict(message, groupKey) {
        const error = new Error(message);
        error.stage = 'conflict';
        error.groupKey = groupKey;
        throw error;
    }

    async function execute(action) {
        if (busy) throw new Error('A regex operation is still pending');
        busy = true;
        try {
            if (action.kind === 'reorder') {
                const target = requireTarget(action.groupKey);
                const rules = read(target);
                const ids = new Set(action.ids);
                if (ids.size !== rules.length || action.ids.length !== rules.length || rules.some(rule => !ids.has(rule.id))) {
                    conflict('Regex list changed; reorder it again', action.groupKey);
                }
                await attempt(() => save(action.ids.map(id => requireRule(target, id)), target.type, target), 'save', action.groupKey);
            } else {
                // Capture identities before a confirmation/editor/network await,
                // then re-read data immediately before each individual write.
                const refs = action.refs.map(ref => ({ ...ref, target: requireTarget(ref.groupKey) }));
                refs.forEach(ref => requireRule(ref.target, ref.id));
                if (!refs.length) return 'unchanged';
                if (action.kind === 'export') {
                    exportScripts(refs.map(ref => requireRule(ref.target, ref.id)));
                    return 'unchanged';
                }
                if (action.kind === 'edit') return await edit(refs[0].id, refs[0].target.type, refs[0].target);
                let destination;
                let destinationKey;
                if (action.kind === 'move') {
                    const group = snapshot.groups.find(group => group.type === action.toType && group.available);
                    if (!group) throw new Error('Destination is not available');
                    destination = requireTarget(group.key);
                    destinationKey = group.key;
                }
                if (['delete', 'move'].includes(action.kind) && !await confirm(action.kind, action.toType, refs.length)) return 'cancelled';
                if (action.kind === 'move') {
                    for (const ref of refs) {
                        if (ref.target.type === destination.type) continue;
                        const rule = requireRule(ref.target, ref.id);
                        if (read(destination).some(item => item.id === ref.id)) throw new Error('A rule with this ID already exists at the destination');
                        const before = JSON.stringify(rule);
                        // Never delete the only persisted copy. A partial failure
                        // leaves a copy at the destination and reports Not saved.
                        await attempt(() => save([...read(destination), structuredClone(rule)], destination.type, destination), 'save', destinationKey);
                        await attempt(() => authorize(destination), 'authorize', destinationKey);
                        // Controllers outside this list (e.g. /regex-toggle) can
                        // mutate the same rule while the awaits above run. If the
                        // live source no longer matches what was copied, keep it —
                        // deleting it would silently discard the newer change.
                        const live = requireRule(ref.target, ref.id);
                        if (JSON.stringify(live) !== before) {
                            conflict('Regex rule changed while moving; the destination copy was kept', ref.groupKey);
                        }
                        await attempt(() => save(read(ref.target).filter(item => item.id !== ref.id), ref.target.type, ref.target), 'save', ref.groupKey);
                    }
                } else {
                    const grouped = new Map();
                    refs.forEach(ref => {
                        if (!grouped.has(ref.groupKey)) grouped.set(ref.groupKey, { target: ref.target, ids: new Set() });
                        grouped.get(ref.groupKey).ids.add(ref.id);
                    });
                    for (const [key, { target, ids }] of grouped) {
                        ids.forEach(id => requireRule(target, id));
                        const rules = read(target);
                        const next = action.kind === 'delete' ? rules.filter(rule => !ids.has(rule.id))
                            : rules.map(rule => ids.has(rule.id) ? { ...rule, disabled: !action.enabled } : rule);
                        await attempt(() => save(next, target.type, target), 'save', key);
                        if (action.kind === 'enable' && action.authorize === true) {
                            await attempt(() => authorize(target), 'authorize', key);
                        }
                    }
                }
            }
            await afterChange();
            return 'saved';
        } finally {
            busy = false;
            refresh();
        }
    }

    return { getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, execute, refresh };
}
