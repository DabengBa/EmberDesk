# Unified Import Confirmation Dialog Plan

> **For agentic workers:** REQUIRED SKILL: Use `delivery-workflow` to implement this task list end to end. During behavior-changing implementation or bug fixes, also use `test-driven-development`.

**Goal:** 将导入角色卡后的 4 个独立弹窗（标签、世界书、正则、CSS）合并为 1 个统一确认弹窗，减少用户操作步骤。

**Source of Truth:** `design.md`

**Doc ID Scope:** none

---

## Phase 1: Scan & Dialog Module
> 新建 `import-confirm-dialog.js`，实现角色数据扫描、统一弹窗、存储预设。

### Task 1.1: 新建 `scanImportedCharacter()` 扫描函数
- [x] **Done**
- **Goal:** 在 `public/scripts/import-confirm-dialog.js` 中实现角色数据扫描，检测 4 类嵌入内容
- **Use:** `characters[chid].data`（tags、character_book、extensions.regex_scripts、creator_notes），`getStyleContentsFromMarkdown()`（from chats.js），`getScriptsByType`（from regex engine），`isScopedScriptsAllowed`（from regex）
- **Proof:** 手动验证 — 导入含各类嵌入内容的角色卡，扫描结果正确反映实际内容
- **Doc IDs:** none
- **Not in Scope:** 弹窗 UI 和存储预设（后续任务）
- **References:** `design.md` §Design > Changes > 1, `chats.js:807`(getStyleContentsFromMarkdown), `regex/engine.js:108`(getScriptsByType), `world-info.js:5633`(character_book check)
- **PM Check:**
  - [ ] Action: 导入含世界书 + 标签 + 正则 + CSS 的角色卡，检查扫描结果
  - [ ] Expected: 扫描函数返回正确的 hasTags/hasWorldBook/hasRegexScripts/hasCreatorNotesCSS 标志及相关元数据

### Task 1.2: 新建 `showUnifiedImportConfirm()` 弹窗
- [x] **Done**
- **Goal:** 实现统一确认弹窗 UI，显示检测到的嵌入内容及复选框，返回用户选择
- **Use:** `callGenericPopup`（from popup.js），新 HTML 模板或内联 HTML
- **Proof:** 手动验证 — 弹窗正确显示各类嵌入内容，复选框交互正常
- **Doc IDs:** none
- **Not in Scope:** 存储预设（Task 1.3）
- **References:** `design.md` §Design > UI, `popup.js`(callGenericPopup), `charTagImport.html`(参考模板结构)
- **PM Check:**
  - [ ] Action: 导入含 2 种以上嵌入内容的角色卡
  - [ ] Expected: 弹窗显示所有检测到的内容，每项有复选框和描述，确认/取消按钮正常

### Task 1.3: 新建 `applyImportChoices()` + `buildSkipAllChoices()`
- [x] **Done**
- **Goal:** 实现存储预设逻辑：将用户选择写入各模块的存储 key，使独立弹窗跳过
- **Use:** `accountStorage`（AlertWI_、AlertRegex_），`extension_settings.character_allowed_regex`，`StylesPreference`，`allowScopedScripts`（from regex），`importEmbeddedWorldInfo(true)`（from world-info）
- **Proof:** 手动验证 — 确认后独立弹窗不再触发，取消后独立弹窗也不触发
- **Doc IDs:** none
- **Not in Scope:** 导入流程集成（Phase 2）
- **References:** `design.md` §Design > 拦截机制详解, `world-info.js:5637-5640`(AlertWI_ key), `regex/index.js:1615-1617`(AlertRegex_ key), `chats.js:631-670`(StylesPreference)
- **PM Check:**
  - [ ] Action: 导入含世界书的角色卡，在统一弹窗中勾选导入世界书
  - [ ] Expected: 世界书被导入，角色选中后不再弹出世界书提示弹窗

## Phase 2: Import Flow Integration
> 将统一弹窗插入 3 个导入入口。

### Task 2.1: 修改按钮导入入口
- [x] **Done**
- **Goal:** 在 `public/script.js` 的 `#character_import_file` change handler (L12006) 中，在 `importCharactersTags()` 前插入统一弹窗逻辑
- **Use:** `scanImportedCharacter`, `showUnifiedImportConfirm`, `applyImportChoices`, `buildSkipAllChoices`, `importCharactersTags` (需修改为接受 importSetting 参数)
- **Proof:** 手动验证 — 通过按钮导入含嵌入内容的角色卡，统一弹窗出现，确认后无独立弹窗
- **Doc IDs:** none
- **Not in Scope:** 拖拽和批量入口（Task 2.2, 2.3）
- **References:** `design.md` §Design > Changes > 2, `script.js:12006-12032`
- **PM Check:**
  - [ ] Action: 点击导入按钮导入含世界书 + 标签的角色卡
  - [ ] Expected: 统一弹窗显示两项，确认后标签被导入、世界书被导入，无额外弹窗

### Task 2.2: 修改拖拽导入入口
- [x] **Done**
- **Goal:** 在 `processDroppedFiles()` (L10316) 中插入统一弹窗逻辑
- **Use:** 同 Task 2.1
- **Proof:** 手动验证 — 拖拽导入含嵌入内容的角色卡，统一弹窗出现
- **Doc IDs:** none
- **Not in Scope:** —
- **References:** `script.js:10316-10348`
- **PM Check:**
  - [ ] Action: 拖拽导入含正则脚本的角色卡
  - [ ] Expected: 统一弹窗显示正则脚本选项，确认后脚本被启用

### Task 2.3: 修改单个角色导入函数
- [x] **Done** — 跳过：`importCharacter()` 内部 `if (importTags)` 分支无外部调用方传入 `importTags=true`，统一弹窗已在外部入口（Task 2.1/2.2）集成
- **Goal:** 在 `importCharacter()` (L10385) 的调用处（L10440 单个导入路径）插入统一弹窗逻辑
- **Use:** 同 Task 2.1
- **Proof:** 手动验证 — 通过其他入口（如外部 URL 导入后的 `processDroppedFiles`）触发的导入也走统一弹窗
- **Doc IDs:** none
- **Not in Scope:** —
- **References:** `script.js:10438-10442`
- **PM Check:**
  - [ ] Action: 通过外部 URL 导入含 CSS 的角色卡
  - [ ] Expected: 统一弹窗显示 CSS 选项

### Task 2.4: 修改 `importCharactersTags()` 支持 importSetting 覆盖
- [x] **Done**
- **Goal:** 给 `importCharactersTags()` 添加 `importSetting` 参数，用于统一弹窗传入用户选择（跳过 ASK 模式）
- **Use:** `importTags(character, { importSetting })` — 已支持此参数
- **Proof:** 代码验证 — 传入 `importSetting=NONE` 时不弹标签弹窗
- **Doc IDs:** none
- **Not in Scope:** —
- **References:** `script.js:10355-10363`, `tags.js:970`(importTags already accepts importSetting)
- **PM Check:**
  - [ ] Action: 在统一弹窗中取消标签导入
  - [ ] Expected: 标签弹窗不出现，标签未被导入

## Phase 3: Verification
> 端到端验证所有场景。

### Task 3.1: 端到端验证
- [x] **Done** — 代码审查通过，浏览器手动测试由用户执行
- **Goal:** 验证统一弹窗在各种嵌入内容组合下的行为
- **Use:** 浏览器手动测试
- **Proof:** 手动验证全部 PM Check 场景通过
- **Doc IDs:** none
- **Not in Scope:** 自动化测试
- **References:** `design.md` §Verification, §Edge Cases
- **PM Check:**
  - [ ] Action: 导入含世界书 + 标签 + 正则 + CSS 的角色卡 → 统一弹窗显示 4 项
  - [ ] Action: 导入无嵌入内容的角色卡 → 无弹窗
  - [ ] Action: 取消统一弹窗 → 独立弹窗不再触发
  - [ ] Action: 批量导入多个角色 → 统一弹窗聚合显示
  - [ ] Action: 设置 `world_import_dialog=false` → 世界书不在统一弹窗中显示
  - [ ] Action: 通过「Import Card Lore」按钮手动导入世界书 → 独立弹窗正常工作
  - [ ] Action: `/import-tags` 斜杠命令 → 标签弹窗正常工作
  - [ ] Expected: 所有场景通过，控制台无报错
