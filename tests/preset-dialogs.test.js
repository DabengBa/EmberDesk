import { expect, jest, test } from '@jest/globals';
import { createPresetDialogs } from '../public/scripts/preset-dialogs.js';

const t = (parts, ...values) => parts.reduce((text, part, index) => text + part + (values[index] ?? ''), '');

function setup(result) {
    const showLocalDialog = jest.fn().mockResolvedValue(result);
    return { dialogs: createPresetDialogs({ showLocalDialog, t }), showLocalDialog };
}

test.each(['save', 'discard', 'cancel'])('dirty preset switch preserves %s', async action => {
    const { dialogs, showLocalDialog } = setup({ action, values: {} });
    expect(await dialogs.confirmSwitch()).toBe(action);
    expect(showLocalDialog.mock.calls[0][0].scope).toBe('presets');
});

test('dismissed switch and name requests cancel without inventing input', async () => {
    const { dialogs, showLocalDialog } = setup(null);
    expect(await dialogs.confirmSwitch()).toBe('cancel');
    expect(await dialogs.askName('Existing')).toBeNull();
    showLocalDialog.mockResolvedValueOnce({ action: 'save', values: { name: 'Updated' } });
    expect(await dialogs.askName('Existing')).toBe('Updated');
    expect(showLocalDialog.mock.calls.at(-1)[0].fields[0].value).toBe('Existing');
});

test('only affirmative actions confirm delete, restore and overwrite', async () => {
    const { dialogs, showLocalDialog } = setup(null);
    expect(await dialogs.confirmDelete()).toBe(false);
    expect(await dialogs.confirmRestore(true)).toBe(false);
    expect(await dialogs.confirmOverwrite()).toBe(false);
    showLocalDialog.mockResolvedValue({ action: 'confirm', values: {} });
    expect(await dialogs.confirmDelete()).toBe(true);
    expect(await dialogs.confirmRestore(false)).toBe(true);
    expect(await dialogs.confirmOverwrite()).toBe(true);
});

test.each(['import', 'export'])('%s sensitive-field choices preserve remove, keep and cancel', async mode => {
    const { dialogs, showLocalDialog } = setup(null);
    const preset = { custom_url: '<untrusted endpoint>' };
    expect(await dialogs.confirmSensitiveFields(mode, preset, ['custom_url'])).toBeNull();
    for (const action of ['remove', 'keep']) {
        showLocalDialog.mockResolvedValueOnce({ action, values: {} });
        expect(await dialogs.confirmSensitiveFields(mode, preset, ['custom_url'])).toBe(action);
    }
    expect(preset).toEqual({ custom_url: '<untrusted endpoint>' });
    expect(showLocalDialog.mock.calls[0][0].message).toContain('custom_url');
});

test('connection export distinguishes user close from caller disposal', async () => {
    const { dialogs, showLocalDialog } = setup(null);
    expect(await dialogs.chooseConnectionData()).toBeNull();
    const request = showLocalDialog.mock.calls[0][0];
    expect(request.closeAction).toBe('export');
    expect(request.fields[0].value).toBe('false');
    showLocalDialog.mockResolvedValueOnce({ action: 'export', values: { connection: 'false' } });
    expect(await dialogs.chooseConnectionData()).toBe(false);
    showLocalDialog.mockResolvedValueOnce({ action: 'export', values: { connection: 'true' } });
    expect(await dialogs.chooseConnectionData()).toBe(true);
});

test('dialog failures propagate to the existing command error path', async () => {
    const { dialogs, showLocalDialog } = setup(null);
    showLocalDialog.mockRejectedValue(new Error('bundle unavailable'));
    await expect(dialogs.askName('Existing')).rejects.toThrow('bundle unavailable');
    await expect(dialogs.chooseConnectionData()).rejects.toThrow('bundle unavailable');
});
