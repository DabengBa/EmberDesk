import { expect, test } from '@playwright/test';

import { testSetup } from './frontend/frontent-test-utils.js';

test.describe('group chat retirement', () => {
    test('workspace shell no longer exposes Group Chats entry', async ({ page }) => {
        await testSetup.awaitST({ page });
        await expect(page.locator('.react-workspace-shell-nav-button').filter({ hasText: 'Group Chats' })).toHaveCount(0);
        await expect(page.locator('#rm_button_group_chats')).toHaveCount(0);
        await expect(page.locator('#rm_group_chats_block')).toHaveCount(0);
        await expect(page.locator('#option_convert_to_group')).toHaveCount(0);
        await expect(page.locator('#rm_print_characters_block .group_select')).toHaveCount(0);
    });
});
