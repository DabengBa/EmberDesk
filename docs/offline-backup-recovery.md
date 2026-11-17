# 离线备份与隔离恢复

本操作复制完整 `DATA_ROOT`，而不是只导出某个用户。先停止 EmberDesk 和所有可能写入该目录的进程；SQLite 的数据库和可能存在的 WAL 必须一起复制。配置文件可能在数据目录之外，需要按实际部署另行保存。

在仓库根目录运行，目标目录必须不存在，且其父目录必须已经存在：

```sh
node scripts/offline-backup.mjs backup --source /path/to/data --destination /path/to/backup --confirm-stopped --include-keys
node scripts/offline-backup.mjs restore --source /path/to/backup --destination /path/to/restored-data --confirm-stopped
```

`--confirm-stopped` 表示操作者确认写入已经停止；`--include-keys` 明确选择完整备份包含密钥。备份和恢复目录不能与来源路径重叠，恢复不会覆盖已有目录。完整备份包含账户、会话材料和密钥，应妥善保管。恢复后可在隔离环境使用 `--dataRoot /path/to/restored-data` 启动现有应用，配置文件仍按部署情况指定。

指向来源目录内部的符号链接会重定位到副本内部；指向外部或无法解析的链接会使操作报错，避免副本依赖来源或丢失媒体。

普通用户 ZIP 与完整备份不同：ZIP 不包含密钥文件或 SQLite 数据库，以 canonical 非密钥切片重建兼容文件及媒体，并清理设置和预设副本中的已知凭据；无法解析的设置或预设 JSON 不进入 ZIP。它不是整站恢复副本。`allowKeysExposure` 对其他秘密 API 的既有行为不变。

## 数据与目标模型

| 现有位置和数据 | 对应及恢复方式 |
| --- | --- |
| `DATA_ROOT/_storage`、`cookie-secret.txt` 等根目录内容 | 账户和会话所需数据，完整备份整体保留。 |
| `<handle>/storage/emberdesk.sqlite` 和存在的 `-wal`、`-shm` | 各用户 canonical 权威存储；角色、世界书、聊天、设置、预设/连接配置和秘密随数据库原样恢复。 |
| `<handle>/storage` 内受管媒体及用户目录中的角色图片、聊天附件、背景等 | 与数据库引用和兼容路径一起原样恢复；媒体文件仍由现有应用读取。 |
| 角色、世界书、聊天及设置等兼容文件 | 用户 ZIP 由 canonical 非秘密数据重建相应导出，并保留用户目录中的其他文件；完整备份保留原目录。 |

节点 1 不改变数据模型或引入新服务；后续目标模型的角色、世界书、会话与消息、设置/连接、秘密和媒体对象分别对应上述权威记录及其文件引用。
