import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@jest/globals';

test('React retry wiring retains pending fields on failure and resubmits them', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const source = fs.readFileSync(path.join(root, 'app/world-info-workbench.tsx'), 'utf8');
    const start = source.indexOf('const saveFields = (fields: Record<string, unknown>) => {');
    const end = source.indexOf('\n    return (<>', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const save = source.slice(start, end);
    expect(save).toContain('pendingFieldsRef.current = { ...pendingFieldsRef.current, ...fields };');
    expect(save).toContain('if (result !== false) {\n                        pendingFieldsRef.current = {};');
    expect(save).toContain("setSaveState(result === false ? 'error' : 'saved');");
    expect(save).toContain(".catch(() => {\n                if (seq === saveSeqRef.current) {\n                    setSaveState('error');");
    expect(source).toContain('onClick={() => saveFields(pendingFieldsRef.current)}');
    expect(source).toContain('{ ...entry, ...pendingFieldsRef.current }');
});
