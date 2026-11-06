---
description: "Proposed design for coordinating character text replacement with existing saves, uncertain HTTP outcomes, and canonical refresh."
kind: technical
topic: character-text-replace-recovery-plan
relations:
  related:
    - tech/canonical-sqlite-store-manager.md
code:
  paths:
    - app/workspace-panels.tsx
    - public/script.js
    - public/scripts/character-lifecycle-service.js
    - public/scripts/chat-ops-service.js
    - public/scripts/feature-settings.js
    - public/scripts/world-info.js
    - public/scripts/world-info-workbench-service.js
    - src/endpoints/characters.js
    - src/endpoints/character-text-replace-service.js
    - src/endpoints/character-write-service.js
    - src/endpoints/canonical-chat-write-service.js
    - src/canonical-sqlite-migrations.js
    - tests/character-text-replace.e2e.js
    - tests/character-text-replace-service.test.js
---

# 角色查找替换：写入协调与恢复方案

**状态：提案，尚未实现或验证。** 本文以 `fix/character-replace-race` 工作树的现有代码为依据，解决 PR #30 的同一工作区内旧数据覆盖、部分写入误报和恢复问题；不是已交付行为。原功能范围和现有用户语义以 [Character Text Replace](../db/features/character-text-replace.md) 为准。

## 1. 要解决的问题与范围

1. 替换请求的响应丢失，不代表服务端没有提交；立刻重读也可能早于服务端提交。恢复旧编辑器或重试替换会覆盖结果，或把替换执行两次。
2. 开始替换时，角色草稿、聊天消息、聊天 metadata 和世界书可能各有等待中的 debounce 或正在执行的保存。取消定时器不等于保存了草稿；`fetch` 失败也不证明旧请求已经停止。旧写入晚于替换提交会覆盖新数据。
3. 角色和聊天写入可能返回 `ok: false, authorityCommitted: true`：SQLite 已提交，但兼容文件投影失败。现有替换服务只检查 `ok`，可能把已提交误报为未应用。
4. 当前聊天严格重读遇到空数组仍会清空内存；重读失败后如果保留清空结果并继续保存，可能用空聊天或开场白覆盖原历史。角色、聊天、世界书刷新不能在尚未全部验证时部分安装旧状态。
5. 世界书先写、角色嵌入快照后写；后者失败时不能谎称两者一致。现有产品允许分区域部分成功，没有跨区域回滚。

**本次保证的边界：**当前登录用户、一个受协调的工作区客户端，对当前角色、所选世界书和当前聊天发起的替换，以及该客户端中会覆盖这些目标的保存。角色卡始终属于保护范围：即使未选择卡字段，世界书替换也可能更新卡内嵌快照。若选择聊天，还包括其消息和 metadata；若选择世界书，包括绑定世界书的缓存、草稿和保存。

**不保证：**其他标签页、设备、旧版本客户端、插件或外部 API 同时改写同一目标时不发生覆盖；也不提供多资源原子提交、撤销、跨客户端版本冲突检测或崩溃后自动补齐所有兼容文件。使用本方案时须停止这些并发写入。第二阶段是否需要版本检查，必须针对具体跨客户端场景另行设计，不能把本方案说成解决了它们。

## 2. 已核实的代码事实

| 位置 | 与设计有关的现状 |
| --- | --- |
| `app/workspace-panels.tsx` | 替换对话框暂停角色 autosave；当前异常路径把网络错误、空响应等作为可能已应用，关闭时再重读一次。单次重读不是完成屏障。 |
| `public/script.js` | `persistAuthoringDraftBeforeLegacyAction()` 先保存角色草稿；`saveMetadata()` 调用 `saveChatConditional()`。一次完整聊天保存同时包含消息和 metadata。 |
| `public/scripts/character-lifecycle-service.js` | `saveCharacterAuthoringFromPayload()` 生成 `FormData`，可能先异步处理头像，再向 `/api/characters/edit` 发请求；必须在最终 dispatch 前检查暂停，不能仅检查函数入口。 |
| `public/scripts/chat-ops-service.js`、`public/scripts/feature-settings.js` | 聊天与 metadata 有独立 debounce。`saveChatConditional()` 的等待、取消和布尔结果不足以证明一个失败请求在服务端已结束。`getChat({ strictReload: true })` 仍会在空响应时清空状态。 |
| `public/scripts/world-info.js` | `saveWorldDebounced` 是独立定时器；`saveWorldInfo(..., false)` 安排保存后即返回，不能把其 Promise 完成当作写入完成。`_save()` 对 `WORLDINFO_UPDATED` 使用 fire-and-forget，写请求结束也不证明订阅者已结束。React 世界书工作台也调用这一保存路径。 |
| `src/endpoints/character-text-replace-service.js` | `runCharacterTextReplace()` 按世界书、角色卡、聊天顺序异步处理，各区域独立提交；世界书成功后可刷新卡的嵌入快照。卡和聊天写入结果当前只以 `writeResult?.ok` 判定。 |
| `src/endpoints/character-write-service.js`、`src/endpoints/canonical-chat-write-service.js` | 兼容文件投影失败时，可能返回 `authorityCommitted: true`；这不是 canonical 写入失败。 |
| `src/endpoints/characters.js` | `/text-replace/apply` 捕获异常后返回通用 500；不能据此推断此前各区域没有提交。 |
| `src/canonical-sqlite.js` | `withCanonicalTransaction(db, fn)` 只接受同步回调。不能把现有跨 `await` 的替换过程直接包进该事务并宣称所有区域原子。 |

## 3. 决策与不变量

- 沿用 canonical SQLite 为权威、兼容文件为投影的模型；继续按区域顺序写入并报告部分成功，不添加回滚快照，不重放替换作为恢复手段。
- 引入**仅服务于上述写入协调**的持久操作记录，而不是所有业务数据的全局版本号、数据内容 hash 或通用任务平台。原因是：HTTP 响应丢失时，仅靠 Git、普通数据库事务、主键或一次读取，无法同时判断“请求是否尚在途中”和“服务端是否仍在写入”。操作 ID、唯一约束及原子状态转换共同解决重复执行和迟到请求；它们不能提供跨客户端冲突保护。
- 对话框进入保护态时，先同步阻止新写入和切换目标，保留草稿，再协调已在途写入。保存失败不能丢弃草稿；未知结果不能当成失败，也不能当成成功。
- 服务端仅在所有相关 canonical 写入及其直接依赖步骤确实结束后标记该操作终态。网络连接断开、HTTP 500、超时、浏览器卸载、进程重启或查询不到记录，都不是终态证明。
- 终态只表示**没有该操作的后续写入**，不表示所有区域都成功。完成后按可能受影响的区域严格重读并验证，再一次性安装状态；任何读取、验证或安装失败均保持保护态。
- 保持一次操作只执行一次。恢复时可重试**查询、fence 和读取**，但不得以新的 ID 悄悄重发同一替换。

## 4. 写入与完成协议

### 4.1 需要协调的写入

给本工作区会影响上述目标的角色保存、聊天/metadata 保存、世界书保存及替换 apply 分配不可重用的随机操作 ID。ID 在实际发出请求之前产生；所有同一客户端的相关保存入口，包含定时、立即保存、在途请求和异常结果，都必须经过共同的轻量跟踪。候选入口包括 `/api/characters/edit`、`/api/chats/save`、`/api/worldinfo/edit` 和 `/api/characters/text-replace/apply`，但**这不是完整清单**：实现前必须沿 `public/script.js`、聊天、世界书工作台和服务端写入调用链列出并覆盖所有能覆盖这些目标的第一方入口。未纳入或不能暂停的入口必须阻止该目标进入替换，而不是静默绕过。

为避免每次普通 autosave 额外往返，普通保存仍以一次写请求发出：请求携带工作区写会话 ID 和操作 ID；服务端在**任何可能写入的异步步骤之前**，通过短同步 SQLite 事务检查会话、原子认领 ID。认领成功才调用现有写服务；重复 ID 不得再次执行，只返回已记录状态。调用者不能复用 ID，即使请求体不同也不得执行第二次。服务端状态不能由 `response.close` 推断，必须由真正负责写入的 service 的结束路径更新；若服务内部有未等待的 canonical 写入，先消除或显式纳入完成条件。请求断连不能提前标记完成。

这不是零成本方案：候选路径的每次普通保存至少增加一次认领和一次终态记录的 SQLite 短事务，页面会话还需初始化；`synchronous = FULL` 下可能影响大量 autosave 和长聊天性能。实施时对比现有行为测量保存延迟、并发请求及数据库增长，验证安全空闲轮换；若成本不可接受，重新设计同等安全的完成证明，而不是删除状态记录后仍宣称可以处理未知结果。数据库不可用或 canonical 存储不可用时不能退回未跟踪的替换。

写会话由服务端创建，客户端收到会话 ID 后才能发写请求；每次页面生命周期使用独立会话。服务端按用户隔离会话和操作，复用现有鉴权、CSRF 和路径校验。操作记录至少包含会话 ID、操作 ID、类型、受影响目标、状态及不含正文的结果摘要；不记录查找词、替换词、卡或聊天正文。状态和摘要写入失败时不伪造终态。表和索引经现有 canonical SQLite migration 管理，不能借长事务跨越 `await`。

### 4.2 fence：处理尚未到达的请求

对指定会话/操作 ID 提供可重复调用的 fence 操作，所有判断在一个短 SQLite 事务内完成：

| 当前记录 | fence 行为 | 含义 |
| --- | --- | --- |
| 不存在 | 插入 `cancelled` 占位记录 | 迟到的原写请求遇到该记录时必须拒绝，不能再执行。 |
| `running` | 返回 `running` | 原请求已认领；等待服务端终态，不能取消为已结束。 |
| `finished` / `cancelled` / `interrupted` | 返回已记录状态 | 不重新执行写入；`interrupted` 仍需按可能部分提交恢复。 |

写请求认领和 fence 竞争同一个唯一键，只有一个能先成功。因此**单纯查询不到记录不够**，但成功 fence 后，未认领的迟到请求不会写入。fence 响应丢失时以同一 ID 重试 fence；服务不可用时保持保护，不用等待时间推断结果。

工作区会话关闭时，原子标记会话为关闭，之后该会话所有迟到的写请求一律拒绝。已认领的请求仍可能在运行，必须等待终态；不能把关闭会话当作取消这些请求。只有该会话的在途操作均已解决、恢复所需结果已消费，才可清理它的操作明细；保留关闭会话的最小不可复用标记以阻挡迟到请求。长期打开的会话应在安全空闲点轮换，避免明细无限增长；轮换不得在仍需查询的写入进行时清理。不能靠任意超时删除 tombstone，除非另行证明旧请求不可能再获准执行。

### 4.3 替换意图与状态

在任何替换前 flush 之前，客户端创建持久替换意图，记录目标、所选范围和当时已在途的相关保存 ID；响应丢失时以同一意图 ID 重试登记，或查询/fence，不创建第二个意图。准备请求迟到也须受取消占位记录约束，不能把已取消意图复活。每个之后由 flush 产生的保存 ID，必须在其请求发送前追加到意图并得到确认。登记重复不得重置已存在的状态。意图不存储敏感正文。这样，即使页面在 flush 或 apply 过程中刷新，恢复入口仍能找到并 fence 尚未认领的写请求、等待已认领的请求。

| 意图状态 | 允许的转换 | 说明 |
| --- | --- | --- |
| `preparing` | `ready`、`cancelled`、`interrupted` | 保护中，登记和处理旧写入及 flush；尚未运行替换。取消前仍须解决已发出的保存。 |
| `ready` | `running`、`cancelled` | flush 完成、资源身份确认、预览仍有效；apply 通过短事务原子认领。 |
| `running` | `finished`、`interrupted` | 只允许一个执行者。重复 apply 返回状态而非重跑。`interrupted` 只能按第 7 节离线处理。 |
| `finished` | 已协调并确认 | 保存可用的区域结果，或标注 `unknown_partial`；所有可能受影响区域均须重读。 |
| `cancelled` | 已协调并确认 | 保证该意图不能再开始替换；之前已提交的 flush 仍须反映到本地。 |
| `interrupted` | 已协调并确认 | 执行可能在任一区域提交后中断；不得视为全部失败或自动重试。 |

`ready → running` 与取消/fence 必须互斥：取消先到则迟到 apply 被拒；apply 先认领则只能等其真实结束。结果记录应区分每区域 `not_attempted`、`unchanged`、`committed`、`not_committed`、`unknown`，及独立的投影告警；异常发生时不能猜测尚未记录的区域未提交。状态 API 要求相同用户身份，并允许安全地重复读取。现有路由可保留为执行入口，但禁止无意图 ID 的第一方替换绕过该协议。

## 5. 客户端完整流程

1. **同步进入保护。** 打开对话框后仍可设置查询和区域；在用户首次请求预览、任何会触发 flush 的 `await` 之前，固定本次意图的角色 avatar、聊天 ID 和选择范围。此时阻止生成、发送、切换角色/聊天、相关编辑与新的自动保存。标记所有相关写入 owner 为暂停：角色编辑、聊天、metadata、世界书；不能只依赖模态框的 `inert`。任何已进入异步流程、尚未实际发请求的保存，都须在最终 dispatch 前再次检查暂停状态；已 dispatch 的 ID 同步进入在途集合。
2. **保留草稿并建立意图。** 捕获角色、消息/metadata 和相关世界书的当前内存快照及 dirty 信息；在发送意图登记或开始可能改变 canonical 的 flush 之前，使用现有浏览器 IndexedDB 能力，在同一本地事务中持久化本次恢复快照、用户/目标、写会话与意图 ID、已在途保存 ID。写入失败、存储不可用或配额不足则不开始替换，维持编辑状态并提示用户；不要把 `localStorage` 的容量假设当作成功。快照按登录用户及目标隔离，仅用于恢复/导出，不自动覆盖服务器内容；协调完成或用户明确丢弃后清理。它可能含用户正文，应告知其保存在本机浏览器，不记录凭据。
3. **解决已有写入。** 登记意图与所有已在途/结果未知的保存 ID。对每个 ID 等待真实终态；若请求结果不明，先 fence：`cancelled` 表示未执行，`running` 则继续查状态。成功响应也只有在服务端协议确认 `finished` 后才算完成。不能仅等待当前 Promise，也不能靠重试一次保存来覆盖不确定请求。
4. **按最新草稿 flush。** 先处理旧写入，再基于受保护的最新快照依次保存必要的角色、聊天及 metadata、世界书。聊天和 metadata 要作为同一聊天快照处理，且先处理两个 debounce；世界书不能依赖 `saveWorldInfo(..., false)` 的返回值。若世界书被选择，暂停/清理所有可能影响绑定书的本客户端在途世界书保存，再根据已保存的角色重新确认绑定；未选择卡字段也须保护卡。每个 flush 操作登记到意图并等待确定终态。可证明未提交的失败保留 dirty 状态；结果不明则继续协调，不能执行替换或丢弃快照。
5. **预览与 apply。** 对完成 flush 的 canonical 数据预览；查询参数或排除项变化后使预览失效并重新预览。用户修改区域时，不复用已固定范围的意图：先阻止 apply，解决已登记的保存、原子取消旧意图并完成必要协调，再以新范围准备新意图和预览，不要求用户丢弃已编辑内容。取消与迟到 apply 的竞争仍由服务端原子状态转换决定。仍检查生成进行中。用户确认后，把相同意图原子推进到 `running` 并执行一次 apply；正常响应和结果不明都以意图状态为准。原先调用关闭对话框的一次重读不能代替这个屏障。
6. **严格协调并解除保护。** 等到 `finished`、`cancelled` 或经离线处理的 `interrupted`；按该意图**可能**影响的卡、当前聊天和世界书分别读取，而不是仅按 `applied` 标志读取。卡读取失败不能 remount 旧草稿；聊天先读取到独立变量，验证返回类型、非缺失的合法 header、消息结构和原目标身份，再安装，空响应/缺失会话不等于合法空聊天；世界书要绕过或失效旧缓存并校验目标。先完成全部必要读取与验证，确认未切换用户/角色/聊天，再协调安装 React 草稿、聊天及 metadata、世界书缓存/视图。安装过程中失败也不得恢复旧 autosave；保留快照并允许重试协调。
7. **结束。** 展示真实的分区域结果和投影告警；对话框关闭、恢复编辑和 autosave 的前提是协调成功。任何受保护状态都可导出快照；未知写入不能提供会悄悄释放旧状态的“强制关闭”。明确取消且所有相关写入均已解决时，可以安全退出并保留尚未保存的草稿。

页面重新打开时，先检查当前用户本地恢复标记和服务端未确认意图，在允许相关目标的编辑器和自动保存使用旧内存数据之前恢复。若本地标记存在但服务端登记尚未到达，先以同一 ID fence 意图登记，再 fence 标记中的相关保存 ID；登记已存在则读取其已登记 ID，fence 未认领者、等待已认领写入，并按上面规则重读。不能把“服务端尚无记录”当作没有迟到请求。恢复不依赖原 React 组件是否还在。若有其他活跃客户端，不能自动关闭其会话；要求用户先停止其写入。本方案不保证浏览器站点数据被清除或磁盘损坏后的本地草稿可恢复，服务端意图只保存状态而不保存正文。

## 6. 部分成功、投影与嵌入快照

- 卡和聊天写入应依据 `authorityCommitted` 判定 canonical 是否已提交；`ok: false, authorityCommitted: true` 显示“已写入，兼容文件待修复”，保留已有 repair 记录/告警，不能显示成未应用。确认 `authorityCommitted: false` 才可称为未提交；异常或缺失信息是 `unknown`。世界书沿用同一语义。
- 保持现有世界书 → 卡 → 聊天顺序和逐区域结果。若世界书提交后卡快照更新失败或状态不明，必须明确显示“世界书已更新、卡内嵌快照未确认”；不能把世界书整体误报为失败，也不能承诺两者已一致。
- 对确需修复的嵌入快照，提供单独的、可重复的“从当前 canonical 世界书同步卡内嵌快照”动作：完成原意图屏障后，重新读取**当前**卡、绑定及世界书，只更新嵌入快照，不重跑查找替换；使用新的受跟踪写入 ID，失败或结果不明仍保留告警。不得用原 apply 前的旧卡副本修复。此动作仍受第 1 节单客户端限制。
- 若投影失败后的 repair 记录本身也失败，不能声称修复任务已可靠登记；结果须保守标记、提示运维检查。本文不把跨进程崩溃导致的投影补写机制冒充已经实现。

## 7. 服务重启与运维恢复

持久的 `running` 不因新进程启动自动变成失败或完成：旧进程可能仍在运行，也可能已经提交一个区域。不能根据进程 ID、启动时间、网络超时或新服务可访问来猜测旧执行者消失。

常规运行中先查询并等待。确实无法获得终态时，受控恢复步骤如下：

1. 导出仍可访问的浏览器草稿；停止所有指向该数据目录的 EmberDesk 实例和相关写入客户端，确认旧进程及其正在处理的请求全部退出。暂停自动重启/滚动部署，确保没有并行旧版本或其他写入者。
2. 使用待实现的离线运维命令，基于现有用户目录与 canonical 数据库解析列出未完成会话、操作和目标；默认只读预览。管理员确认服务已停止后，命令以短事务关闭相应会话，将残留 `running` 标为 `interrupted`，保留可用的区域结果与未知范围。它不写角色、世界书或聊天，不把状态改成“未提交”，不自动重跑。命令的“服务已停止”是明确运维前提，不得声称仅靠 SQLite 就验证了所有进程都已停止。
3. 启动单个服务。客户端发现 `interrupted` 后，对所有可能受影响的 canonical 目标严格重读，展示实际状态及不确定/部分成功提示；如有需要，用户对照已保留快照手动恢复。确认后才解除保护。兼容投影修复继续走现有修复工具/记录。

在无法确认所有旧写入进程都已停止时，**不要执行离线中断**；继续保持目标不可写。该恢复方式牺牲异常情况下的可用性以避免静默数据覆盖，不是自动故障转移。

## 8. 落地顺序与改动位置

每一步先增加能稳定复现的测试，确保失败原因是目标行为，再实现；不把“测试通过”当作对未覆盖并发的证明。实现应放在 PR #30 工作树，避免修改或暂存其他人的未跟踪文件。

1. **写入盘点和结果语义**：核对全部客户端/服务端实际写入口和同步/异步边界，包括 fire-and-forget 事件订阅者及刷新时触发的副作用；对可能稍后写入目标的订阅者，纳入保护期跟踪直至结束，或使其旧任务失效，不能在解除保护后让旧事件发出保存。在 `src/endpoints/character-text-replace-service.js` 及对应 service tests 区分 canonical 提交、投影失败、异常未知和快照不同步。为既有投影修复路径增加故障注入。
2. **持久操作协议**：通过 `src/canonical-sqlite-migrations.js` 及相邻存储服务实现会话、意图、原子认领/fence、终态与清理；在 `src/endpoints/characters.js`、`src/endpoints/chats.js`、`src/endpoints/worldinfo.js` 的相应入口接入，保持现有安全中间件顺序。按实际调用清单补齐其他入口。实现离线查询/中断工具和权限检查；不得将同步事务跨 `await`。
3. **客户端协调**：在 `public/script.js`、`public/scripts/character-lifecycle-service.js`、`public/scripts/chat-ops-service.js`、`public/scripts/feature-settings.js`、`public/scripts/world-info.js` 与 `public/scripts/world-info-workbench-service.js` 接入写入跟踪、暂停、flush 和恢复；`app/workspace-panels.tsx` 只负责保护态 UI 与命令调用，不能以 React remount 代替数据协调。
4. **严格读取和安装**：拆分聊天读取/校验与状态安装，覆盖角色和世界书的失效/重读；必要时调整 `public/scripts/workspace-panel-host-controller.js` 和 `public/scripts/workspace-panels-react-bridge.js` 的 remount 边界。保留已有聊天、metadata 和角色草稿，处理目标切换和安装失败。
5. **验收和合并**：通过第 9 节的针对性测试、相关构建及 `pnpm run test:compat`；实际用户行为确定后同步 `.docs/db/features/character-text-replace.md` 并运行 `pnpm run docs:check`。核查 PR 的 merge 冲突、完整 diff、未跟踪文件和远端最新 head 后，再决定是否 squash 合并和清理其分支/worktree。

## 9. 验收矩阵

测试使用服务端可控屏障/故障注入，明确观察 canonical 状态、请求认领和终态顺序；只在浏览器拦截并 abort 请求，不能证明“服务端已收到并稍后提交”。至少覆盖：

| 场景 | 必须证明 |
| --- | --- |
| apply 已被服务端认领，响应丢失，提交被人为延后 | 终态前不能关闭/恢复 autosave；一次提前读取不会释放保护；放行服务端后按实际结果重读，替换只执行一次。 |
| apply 请求在服务端认领前被延迟，先 fence | fence 落库后迟到请求被拒，canonical 未因该请求改变；相反顺序先认领时返回 `running`、不能伪取消。 |
| 重复 apply、重复 fence、并发认领 | 同一 ID 仅一个执行者；取消和执行不能同时成功；相同 ID 不同请求体也不能再次写入。 |
| 角色、聊天、metadata、世界书各有 pending 和 in-flight 保存 | 最新草稿先落 canonical，旧请求不得在替换后覆盖；各 debounce 被正确处理，不因取消计时器丢数据。 |
| 某个 flush 请求在服务端执行但浏览器断连 | 不发送 apply 或盲目重试；等待终态，再决定继续或保留草稿。未到达的 flush 经 fence 后迟到也不能写。 |
| 保存事件的订阅者被延迟，试图在重读后保存旧数据 | 保护不能过早解除；受影响订阅者已完成或其旧任务失效，不能在解除保护后覆盖替换结果。 |
| 页面在准备、flush、apply 及终态重读期间分别刷新 | 持久意图和快照可发现；未认领写入被 fence，已认领写入等待；不能先恢复旧编辑器；账号/目标不匹配不能安装快照。 |
| 本地恢复标记已提交，但意图登记还未到达服务端时页面刷新 | 启动先读取本地标记并 fence 该意图及相关保存；迟到登记不能复活已取消意图。 |
| 客户端本地快照持久化失败/容量不足 | 不执行替换、不丢失内存草稿，用户得到可操作错误。 |
| 世界书已提交，卡写入失败或投影失败 | 正确展示部分成功和投影告警；卡快照不同步时只运行独立同步，不重跑替换。 |
| 卡或聊天返回 `authorityCommitted: true, ok: false` | canonical 更新被视为已提交，视图重读；投影问题不被误报为原数据未修改。 |
| 重读返回 HTTP 错误、无效 JSON、空数组、缺失 header、目标变化或安装中异常 | 原聊天/metadata/草稿不被清空或部分替换；无开场白写回，保持保护并可安全重试读取。 |
| 进程在世界书、卡、聊天各提交前后被终止 | 残留 `running` 不自动变终态；先停止所有服务，再离线标记 `interrupted`；恢复展示真实 canonical 数据且不重跑替换。 |
| 会话关闭后迟到请求、操作明细清理和长时间运行 | 关闭会话拒绝迟到请求；仍在运行或未消费的状态不被清理；安全轮换不影响下一会话。 |
| 正常使用、取消、预览参数或区域改变、共享世界书、生成中 | 保留现有功能和用户可见语义；区域改变先安全结束旧意图并重建，取消不丢草稿，预览过期不可 apply，生成中不可 apply。 |

已有 `tests/character-text-replace.e2e.js` 中两项失败用例只能作为起点：其中浏览器 abort 用例尚未模拟服务端晚提交；必须补充真正的服务端屏障。另需服务单元测试验证状态转换、投影结果及注入失败，路由/集成测试验证同用户隔离、重复请求、真实中断/恢复，Playwright 验证真实 UI、草稿、刷新和存储故障。涉及消息渲染、世界书或相关兼容边界时运行 `pnpm run test:compat`。

## 10. 完成定义与明确限制

PR #30 只能在以上保护链条和验收通过后合并；任一步未实现时，不宣称 PR 已解决全部竞态。特别是：

- 不能用“连接超时后重读一次”“关闭对话框前等一个 Promise”或“重启后标为失败”代替服务端完成证明。
- 不能用现有异步多区域调用包装 `withCanonicalTransaction` 来声称原子。
- 跨设备/跨标签页写冲突、外部调用绕过跟踪以及故障期间本地站点数据被清除仍不在本方案保证内；如要保证，必须另做覆盖全部写入路径的服务端并发控制和明确迁移策略。
- 上述操作表、前端接入范围、存储开销及离线工具均是需要验证的实施工作，不是当前代码已有能力。若盘点发现存在无法拦截的本客户端写入，或无法保证旧执行者已退出，必须停在保护态并修订方案，不能降级成静默覆盖。

## 参考

- Stripe：[Idempotent requests](https://docs.stripe.com/api/idempotent_requests.md)、[Handling low-level errors](https://docs.stripe.com/error-low-level)：请求结果不确定时应区分网络失败和服务端实际效果；本文状态/fence 设计不是对 Stripe API 的直接移植。
- SQLite：[Transactions](https://www.sqlite.org/lang_transaction.html)：事务边界及单写入者语义；本文不假定可跨任意异步操作保持应用级原子性。
