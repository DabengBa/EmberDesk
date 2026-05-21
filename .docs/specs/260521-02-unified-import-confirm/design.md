# Unified Import Confirmation Dialog

**Doc ID**: SPEC-260521-02
**Scope**: 将导入角色卡后的 4 个独立弹窗合并为 1 个统一确认弹窗
**Status**: Draft

## Problem

导入一个 PNG 角色卡后，用户可能面对最多 5 个弹窗（含系统文件选择器），其中 4 个是程序弹窗，分散在导入流程的不同阶段：

| 弹窗 | 触发时机 | 模块 |
|------|---------|------|
| 标签导入 | 导入后处理 | `tags.js` |
| 世界书导入 | 角色选中 | `world-info.js` |
| 正则脚本启用 | `CHAT_CHANGED` | `regex/index.js` |
| CSS 应用 | `CHAT_CHANGED` | `chats.js` |

每个弹窗独立触发，顺序不可控，且都有各自的"记忆"存储。用户需要反复确认，体验割裂。

## Research

### 数据可用性

所有 4 项数据在角色导入完成后立即可用（来自 `characters[chid].data`），无需等待 `CHAT_CHANGED` 事件：

| 检测项 | 数据路径 | 检测方式 |
|--------|---------|---------|
| 标签 | `character.tags` | 数组非空 + 过滤排除标签 |
| 世界书 | `character.data.character_book` | 字段存在 |
| 正则脚本 | `character.data.extensions.regex_scripts` | 数组非空 |
| CSS | `character.data.creator_notes` 含 `<style>` 标签 | `getStyleContentsFromMarkdown()` 解析 |

### 现有拦截点

- **标签弹窗**：在 `importCharactersTags()` 中调用，`tag_import_setting` 控制
- **世界书弹窗**：`checkEmbeddedWorld(chid)` 在角色选中时触发，`accountStorage` key `AlertWI_${avatar}` 去重
- **正则弹窗**：`checkCharEmbeddedRegexScripts()` 在 `CHAT_CHANGED` 触发，`accountStorage` key `AlertRegex_${avatar}` 去重
- **CSS 弹窗**：`checkForCreatorNotesStyles()` 在 `CHAT_CHANGED` 触发，`StylesPreference(avatarId)` 去重

### 关键约束

- 4 个弹窗分布在 3 个不同模块中
- 各自使用不同的存储机制（`accountStorage`、`extension_settings`、`StylesPreference`）
- 批量导入时标签弹窗按批次处理（不是逐角色），其他弹窗逐角色处理
- 正则和 CSS 检查在 `CHAT_CHANGED` 异步触发，无法在同步导入流程中直接拦截

## Design

### Approach: Pre-scan + Unified Dialog + Storage Pre-set

在 `importCharacter()` 返回后、`selectImportedChar()` 调用前，对导入的角色数据进行预扫描，如果检测到任何可导入的嵌入内容，弹出统一确认弹窗。用户做出选择后，将结果写入各模块的存储 key，使后续独立弹窗检测到"已处理"而跳过。

### 用户流程

**Before（4 个弹窗）**：
```
选文件 → [标签弹窗] → 选中角色 → [世界书弹窗] → CHAT_CHANGED → [正则弹窗] → [CSS弹窗]
```

**After（1 个弹窗）**：
```
选文件 → 扫描角色数据 → [统一导入确认弹窗] → 选中角色 → (独立弹窗全部跳过)
```

### 统一弹窗 UI

```
┌─────────────────────────────────────────────────┐
│  Character Import Options                        │
│  "角色名" contains the following embedded items:  │
│                                                  │
│  ☑ Import tags (3 tags: tag1, tag2, tag3)        │
│                                                  │
│  ☐ Import embedded World/Lorebook                │
│    "Lorebook Name" — 12 entries                  │
│                                                  │
│  ☐ Enable embedded regex scripts (2 scripts)     │
│                                                  │
│  ☐ Apply creator notes CSS to entire app         │
│    (default: apply to Creator's Notes only)      │
│                                                  │
│         [ Cancel ]  [ Confirm ]                  │
└─────────────────────────────────────────────────┘
```

- 只显示角色中实际存在的嵌入内容
- 如果 4 项都没有，不弹窗，直接走原流程
- 标签默认勾选（与现有行为一致），其他默认不勾选
- 批量导入时，弹窗显示所有导入角色的聚合视图

### Changes

#### 1. 新建 `public/scripts/import-confirm-dialog.js`

新模块，职责：
- `scanImportedCharacter(characterData)` — 扫描角色数据，返回检测到的嵌入内容列表
- `showUnifiedImportConfirm(scanResults)` — 显示统一弹窗，返回用户选择
- `applyImportChoices(character, choices)` — 将用户选择写入各模块的存储

```javascript
/**
 * @typedef {Object} ImportScanResult
 * @property {boolean} hasTags - 角色有可导入标签
 * @property {string[]} tagNames - 标签名称列表
 * @property {boolean} hasWorldBook - 角色有嵌入式世界书
 * @property {string} worldBookName - 世界书名称
 * @property {number} worldBookEntryCount - 世界书条目数
 * @property {boolean} hasRegexScripts - 角色有嵌入式正则脚本
 * @property {number} regexScriptCount - 正则脚本数量
 * @property {boolean} hasCreatorNotesCSS - 创作者注释含 CSS
 */

/**
 * Scan character data for importable embedded content.
 * @param {Object} characterData - characters[chid].data
 * @param {Object} character - characters[chid] (for tags)
 * @returns {ImportScanResult}
 */
export function scanImportedCharacter(characterData, character) { ... }

/**
 * Show unified import confirmation dialog.
 * Returns null if user cancelled or nothing to show.
 * @param {ImportScanResult[]} scanResults - One per imported character
 * @returns {Promise<Object|null>} User choices
 */
export async function showUnifiedImportConfirm(scanResults) { ... }

/**
 * Apply user choices by writing to each module's storage,
 * so the individual popups skip themselves.
 * @param {Object} character - characters[chid]
 * @param {Object} choices - User choices from dialog
 */
export function applyImportChoices(character, choices) { ... }
```

#### 2. 修改 `public/script.js` — `importCharacter()` 返回后插入扫描

**单个角色导入**（`#character_import_file` change handler, L12006）：

Before:
```javascript
for (const file of e.target.files) {
    const avatarFileName = await importCharacter(file);
    if (avatarFileName !== undefined) {
        avatarFileNames.push(avatarFileName);
    }
}
if (avatarFileNames.length > 0) {
    await importCharactersTags(avatarFileNames);
    selectImportedChar(avatarFileNames[avatarFileNames.length - 1]);
}
```

After:
```javascript
for (const file of e.target.files) {
    const avatarFileName = await importCharacter(file);
    if (avatarFileName !== undefined) {
        avatarFileNames.push(avatarFileName);
    }
}
if (avatarFileNames.length > 0) {
    // Unified import confirmation
    const scanResults = scanImportedCharacters(avatarFileNames);
    let importChoices = null;
    if (scanResults.some(r => r.hasAnyContent)) {
        importChoices = await showUnifiedImportConfirm(scanResults);
        // Cancel = skip all, pre-set storage to suppress individual popups
        const effectiveChoices = importChoices ?? buildSkipAllChoices(scanResults);
        for (const { character, choice } of zip(avatarFileNames, effectiveChoices)) {
            applyImportChoices(character, choice);
        }
    }
    // Tags still need explicit import (writes to tag_map)
    const tagSetting = importChoices ? importChoices.tagImportSetting : tag_import_setting.NONE;
    await importCharactersTags(avatarFileNames, { importSetting: tagSetting });
    selectImportedChar(avatarFileNames[avatarFileNames.length - 1]);
}
```

**拖拽导入**（`processDroppedFiles()`, L10316）和**批量导入**（`importCharacter()` from BulkEditOverlay）：同样的模式。

#### 3. 修改各模块的检测函数 — 添加"已由统一弹窗处理"短路

**`world-info.js` — `checkEmbeddedWorld(chid)`**：
```javascript
// 在 accountStorage.getItem(checkKey) 检查之后、弹窗之前
// 不需要改动 — applyImportChoices() 已设置 accountStorage key
```

**`regex/index.js` — `checkCharEmbeddedRegexScripts()`**：
```javascript
// 不需要改动 — applyImportChoices() 已设置 accountStorage key
// 或已将角色头像加入 extension_settings.character_allowed_regex
```

**`chats.js` — `checkForCreatorNotesStyles()`**：
```javascript
// 不需要改动 — applyImportChoices() 已通过 StylesPreference.set() 设置偏好
```

**`tags.js` — `importCharactersTags()`**：
```javascript
// 不需要改动 — 统一弹窗后仍然调用 importCharactersTags()
// 但 tag_import_setting 可能仍为 ASK，需要传入 importSetting 覆盖
```

### 拦截机制详解

统一弹窗的核心是**预设存储**，使各独立弹窗的"是否已处理"检查返回 true：

| 弹窗 | 存储 key | 预设动作 |
|------|---------|---------|
| 标签 | 传入 `importSetting=NONE/ALL` 覆盖 | 跳过 ASK 弹窗 |
| 世界书 | `accountStorage.setItem('AlertWI_${avatar}', 'true')` | 跳过提示 |
| 世界书(导入) | 调用 `importEmbeddedWorldInfo(true)` | 直接导入，无二次确认 |
| 正则 | `accountStorage.setItem('AlertRegex_${avatar}', 'true')` | 跳过提示 |
| 正则(启用) | 调用 `allowScopedScripts(character)` | 直接启用 |
| CSS | `StylesPreference(avatarId).set(true/false)` | 跳过提示 |

### 边界情况

| 场景 | 行为 |
|------|------|
| 角色无任何嵌入内容 | 不弹窗，走原流程 |
| 批量导入 3 个角色，只有 1 个有嵌入内容 | 统一弹窗显示该角色的内容，其他角色跳过 |
| 用户取消统一弹窗 | 预设所有存储 key 为"跳过"状态，独立弹窗不再触发。用户如需事后启用，可通过各模块的手动入口（如"Import Card Lore"按钮、Regex 扩展设置）操作 |
| 用户已设置 `tag_import_setting=NONE` | 标签部分不显示在统一弹窗中 |
| 用户已设置 `world_import_dialog=false` | 世界书部分不显示在统一弹窗中 |
| 同名世界书已存在 | 弹窗中显示 "will overwrite" 警告 |
| 角色卡格式不含 `character_book` / `regex_scripts` 字段 | 对应部分不显示 |

### 不变项

- 系统文件选择器（弹窗 1）不变
- 各模块的独立弹窗逻辑不变（作为 fallback 保留）
- 各模块的存储机制不变
- 服务端导入逻辑不变

## Verification

1. 导入含世界书 + 标签的角色卡 → 统一弹窗显示两项，确认后不再有独立弹窗
2. 导入含正则 + CSS 的角色卡 → 统一弹窗显示两项，确认后独立弹窗跳过
3. 导入无嵌入内容的角色卡 → 无弹窗，行为与改动前一致
4. 批量导入 → 统一弹窗聚合显示所有角色的嵌入内容
5. 取消统一弹窗 → 独立弹窗在后续角色选中时正常触发
6. 设置 `world_import_dialog=false` → 世界书不在统一弹窗中显示
