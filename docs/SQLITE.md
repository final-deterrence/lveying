# SQLite 存储与部署

本项目使用 **Node.js 24 内置的 `node:sqlite`**，不需要安装 SQLite 服务、数据库容器或 npm 原生扩展。运行项目的 Node 或容器版本必须为 24；不要改动同一台机器上科协其他服务的 Node 环境。

```bash
node --version
npm ci
npm run dev
```

生产环境使用 `npm run build` 和 `npm start -- --hostname 127.0.0.1 --port 28880`。Docker 容器应在容器内监听 `0.0.0.0`，宿主机端口绑定 `127.0.0.1`，再由现有 Nginx 转发。

## 数据位置与首次迁移

默认数据库文件为 `data/lveying.sqlite`。设置环境变量 `LVEYING_DATA_DIR` 可以指定其他数据目录。节目、弹幕、封禁 IP、抽奖配置、中奖记录及管理员账号均存储在这个数据库中。

首次访问业务接口时自动完成以下步骤：

1. 创建表和索引，启用 WAL、5 秒写锁等待及完整事务持久化。
2. 如果目录内存在 `store.json`、`users.json`，在同一事务中导入；保留原 ID、节目状态、审核时间、历史中奖结果及密码哈希，并兼容旧的单条 `lotteryResult` 字段。
3. 原 JSON 文件不修改、不删除；完成迁移后写入标记，以后启动不会重复导入。没有旧文件时才初始化示例数据和默认管理员。
4. 文件损坏、重复 ID 或导入错误会中止迁移并回滚，应修复源数据后再启动，不会静默清空数据或重置密码。

从旧版切换时，先停止所有旧版应用，备份整个 `data/`，再启动新版，避免旧进程继续写 JSON。迁移后的 JSON 不再更新，不能把它当作活动期间的最新备份。测试时使用单独的 `LVEYING_DATA_DIR`，不要混入正式数据。

部署时持久化挂载**整个数据目录**，其中还包括 `lveying.sqlite-wal`、`lveying.sqlite-shm`。使用服务器本地磁盘；不要放到 NFS 等网络共享目录。当前推荐一个应用实例，不需要为它连接或修改科协的 PostgreSQL/Hasura。

## 弹幕查询

- 手机端与大屏通过索引读取最近 20 条已审核弹幕，按审核时间排列，公开数据不包含 IP。
- 进程内共享 1 秒查询缓存，数据库修订号变化时立即失效；审核、撤回、封禁、删除和清空都能更新快照。
- 管理端每页 50 条，待审核筛选、总数统计由数据库处理；导出时使用单独接口，每次最多读取 1000 条，并固定导出的序号上界。
- 手机端和管理端隐藏后暂停轮询，轮询请求完成后才安排下一次，避免慢网络下堆叠请求。大屏仍每 2 秒同步最新快照。
- 公开接口仍是轮询，SQLite 不等于无限容量。上线前应使用生产版本、预计观众数量和接近活动结束的数据量进行压测，同时观察科协原站、出网带宽、CPU、内存和响应时间。
- 发送限流与自动审核规则、后台审核结果和拦截计数也保存在 SQLite，不需要 Redis 或外部审核服务。详见 [弹幕限流与自动审核](DANMAKU_MODERATION.md)。

`GET /api/danmaku?page=1&pageSize=50&pending=true` 需要管理员认证，返回：

```json
{
  "danmakus": [],
  "stats": { "total": 0, "approved": 0, "pending": 0, "rejected": 0 },
  "pagination": { "page": 1, "pageSize": 50, "total": 0, "totalPages": 1 }
}
```

`pageSize` 范围为 1–100。`GET /api/danmaku/export?after=0&pending=false` 同样需要认证，返回 `danmakus`、`snapshot`、`nextCursor` 和 `hasMore`；后续批次携带相同 `snapshot` 及上一批的 `nextCursor`。日常轮询不返回全部历史。

列表和导出均支持 `status=all|pending|approved|rejected`；旧参数 `pending=true` 仍可用，待审核不包含已拦截内容。后台返回 `review`（状态、自动/人工来源、原因），公开接口不返回这些内部信息。

## 在线备份与恢复

```bash
npm run backup:db
# 或指定一个不存在的目标文件
npm run backup:db -- /backup/lveying-before-show.sqlite
```

脚本使用 SQLite 在线备份 API，包含 WAL 中最新提交的数据。网站运行时不要只复制主 `.sqlite` 文件。备份包含账号密码哈希及内部 IP，应限制读取权限，另存到服务器外；在容器中执行时，也要把备份输出到持久化目录。

恢复时停止所有应用实例，先保留当前数据目录的完整副本；使用备份替换主数据库，并确保旁边没有上一个数据库遗留的 `-wal`、`-shm` 文件，再重新启动。不要在运行中的数据库旁直接覆盖文件。

## 验证

```bash
npm test
npm run lint
npm run build
```

测试使用临时目录，覆盖旧数据迁移与回滚、密码保留与修改、跨连接审核撤回与封禁、分页、十万条历史下的索引查询、四个进程并发写入、接口鉴权与脱敏及 WAL 在线备份恢复，不修改项目的实际数据。
