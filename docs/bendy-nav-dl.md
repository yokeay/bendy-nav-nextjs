# bendy-nav-dl：独立深度学习标签推荐服务

> 版本：v0.2（重构草案 — 从 NextJS 内嵌改为独立 Python 服务）
> 作者：Hoy Smith
> 日期：2026-04-23
> 关联业务：笨迪导航（bendy-nav-nextjs）
> 仓库：bendy-nav-dl（独立仓库，Docker 部署）

---

## 1. 背景与目标

笨迪导航（bendy-nav-nextjs）通过浏览器扩展 / bookmarks.html 导入 / 手动录入三条通道，
将书签沉淀到统一表 `bendy_bookmark`（Prisma model `Bookmark`），其中 `tags` 字段
存储用户或扩展打的逗号分隔标签。当前只有管理员手工置顶的推荐位，
**没有**基于标签语义与内容向量的自动推荐能力。

v0.1 草案设计为 NextJS 内嵌模块，但考虑到：
- Python 生态在 NLP / DL 领域远优于 Node.js
- 模型训练与推理不应占用主站进程资源
- 1c1g 极限部署需要独立进程做资源隔离

因此 **v0.2 将其拆为独立 Python 服务**，与主站通过 HTTP API 对接，
主站后台仅做管理页面渲染，业务逻辑全部在 Python 侧。

### 核心目标

1. **标签推荐**：根据请求传入的 tags，返回 ~100 条语义相近的书签推荐。
2. **内容向量化**：对书签文本做嵌入，存入向量数据库，支撑相似度检索。
3. **独立数据层**：本地 SQLite 存储标签业务数据，不直读主站数据库；
   支持两种数据导入口径（API 拉取 + 接口推送写入）。
4. **夜间重组**：每日 23:30 – 次日 05:30，全表扫描重组标签与向量索引。
5. **双模式运行**：CPU / GPU 可通过配置文件切换，CPU 模式最低 1c1g6G 可运行。

### 非目标

- 不做用户行为序列建模（GRU/LSTM），本期只用静态标签 + 文本向量做推荐。
- 不做多模态推荐，仅处理文本。
- 不做前端页面，后台页面在 bendy-nav-nextjs 的 admin 模块中新增。
- 不直连主站 PostgreSQL / SQLite 数据库，数据通过接口同步。

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   bendy-nav-nextjs (主站)                 │
│  ┌──────────┐  ┌───────────────┐  ┌───────────────────┐  │
│  │ 管理后台   │  │ 推荐消费接口   │  │ 数据推送（可选）   │  │
│  │ /admin/dl │  │ /api/home/... │  │ POST /dl/import  │  │
│  └─────┬─────┘  └───────┬───────┘  └────────┬─────────┘  │
│        │                │                    │             │
└────────┼────────────────┼────────────────────┼─────────────┘
         │ HTTP            │ HTTP               │ HTTP
         ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────┐
│                 bendy-nav-dl (Python 服务)                │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                 FastAPI 应用层                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ 管理后台API│ │ 推荐接口   │ │ 数据导入接口       │ │   │
│  │  │ /api/dl/  │ │ /recommend│ │ /import          │ │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌────────────────┐  ┌─────────────────────────────┐    │
│  │  APScheduler   │  │        推理引擎层             │    │
│  │  定时任务调度    │  │  sentence-transformers      │    │
│  │  23:30-05:30   │  │  (CPU: all-MiniLM / GPU: BGE)│   │
│  └────────────────┘  └─────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐   │
│  │                   数据层                          │   │
│  │  ┌──────────────────┐  ┌───────────────────────┐ │   │
│  │  │  SQLite          │  │  ChromaDB              │ │   │
│  │  │  (标签业务数据)    │  │  (向量存储 + 相似检索)  │ │   │
│  │  │  bendy_bookmark  │  │  collection: bookmarks │ │   │
│  │  │  bendy_dl_*      │  │                        │ │   │
│  │  └──────────────────┘  └───────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 技术选型

### 3.1 核心框架

| 组件 | 选型 | 理由 |
| ---- | ---- | ---- |
| **Web 框架** | FastAPI | 异步高性能，自带 OpenAPI 文档，类型安全，生态成熟 |
| **ORM** | SQLAlchemy + aiosqlite | 异步 SQLite 支持，声明式模型，轻量 |
| **数据校验** | Pydantic v2 | FastAPI 原生集成，模型即文档 |
| **定时任务** | APScheduler 3.x | 轻量 Python 原生，无需 Redis/RabbitMQ，支持 CronTrigger + IntervalTrigger |
| **日志** | Loguru | 零配置，自动轮转，结构化输出 |
| **配置** | YAML + Pydantic Settings | 类型安全的配置管理，支持环境变量覆盖 |

### 3.2 数据存储

| 组件 | 选型 | 理由 |
| ---- | ---- | ---- |
| **业务数据库** | SQLite | 用户要求；WAL 模式支持并发读；零运维 |
| **向量数据库** | ChromaDB | 纯 Python，in-process 运行，无独立服务进程；Docker 友好；
内置 HNSW 索引；支持元数据过滤；pip install 即用；可持久化到磁盘 |
| **向量备选方案** | Qdrant（single-binary） | Rust 实现，极低内存占用；单二进制文件；
适合 1c1g 场景；但需额外进程管理 |

> **极端模式降级方案**：1c1g6G 下如果 ChromaDB 内存仍不够，
> 可降级为 **numpy + SQLite BLOB**：向量存为 SQLite BLOB 列，
> 相似度计算用 numpy 批量余弦相似度（< 10 万条数据时延迟 < 200ms）。
> 此方案零额外依赖，内存占用最低。

### 3.3 推理引擎

| 模式 | 嵌入模型 | 显存/内存 | 向量维度 | 说明 |
| ---- | ---- | ---- | ---- | ---- |
| **CPU** | `all-MiniLM-L6-v2`（sentence-transformers） | ~80MB RAM | 384 | 英文为主，多语言可用；
1c1g 下仍可加载推理 |
| **CPU（中文优化）** | `shibing624/text2vec-base-chinese` | ~400MB RAM | 768 | 中文语义最佳；
需 > 512MB 可用内存 |
| **GPU** | `BAAI/bge-m3` | ~2GB VRAM | 1024 | 多语言 + 多粒度；
推荐精度最高 |
| **GPU（备选）** | `BAAI/bge-large-zh-v1.5` | ~1.3GB VRAM | 1024 | 中文专用 |

> **CPU 模式极限策略**：
> - 默认加载 `all-MiniLM-L6-v2`（384 维，~80MB）
> - 推理时逐批处理，避免全表一次性加载
> - 向量索引构建使用 IVF + PQ 量化（ChromaDB 内置）
> - 如果可用内存 > 512MB，自动升级到 `text2vec-base-chinese`

### 3.4 Docker 打包

```dockerfile
# 两阶段构建：基础镜像 + 运行镜像
FROM python:3.11-slim AS base
# CPU 镜像 ~350MB，GPU 镜像基于 nvidia/cuda ~1.5GB
```

---

## 4. 数据模型设计

### 4.1 SQLite 业务表（镜像主站 `bendy_bookmark`）

```sql
-- 标签数据主表，结构与主站 bendy_bookmark 标签字段对齐
CREATE TABLE bendy_bookmark (
    id              TEXT PRIMARY KEY,           -- 与主站同 ID
    user_id         TEXT NOT NULL,
    ext_bookmark_id TEXT,
    url             TEXT NOT NULL,
    title           TEXT NOT NULL,
    folder_path     TEXT,
    tags            TEXT,                       -- 逗号分隔标签（核心字段）
    lang            TEXT,
    page_title      TEXT,
    page_description TEXT,
    page_text       TEXT,                       -- 正文节选 ≤ 2000 字符
    generated_title TEXT,
    generated_description TEXT,
    crawl_error     TEXT,
    icon_url        TEXT,
    add_date        TEXT,                       -- ISO 8601
    last_modified_at TEXT,
    last_visited_at TEXT,
    is_private      INTEGER DEFAULT 0,          -- 0=false, 1=true
    source          TEXT DEFAULT 'api',
    source_batch_id TEXT,
    is_public       INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'active',
    sort            INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX idx_bookmark_user_id ON bendy_bookmark(user_id);
CREATE INDEX idx_bookmark_tags ON bendy_bookmark(tags);
CREATE INDEX idx_bookmark_status ON bendy_bookmark(status);
CREATE INDEX idx_bookmark_url ON bendy_bookmark(url);
CREATE INDEX idx_bookmark_is_public ON bendy_bookmark(is_public);
```

### 4.2 向量存储（ChromaDB collection）

```
Collection: bookmarks
├── id:        bookmark.id
├── embedding: 384/768/1024 维向量（取决于模型）
├── metadata:  { tags, lang, is_public, user_id, source }
└── document:  "title + page_description + page_text"  (用于重新嵌入)
```

### 4.3 SQLite 管理业务表

```sql
-- 模型管理
CREATE TABLE bendy_dl_model (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,              -- 模型显示名
    model_type      TEXT NOT NULL,              -- 'embedding' | 'recommender'
    model_path      TEXT,                       -- 本地模型文件路径
    model_version   TEXT NOT NULL,              -- e.g. "all-MiniLM-L6-v2-v1"
    vector_dim      INTEGER NOT NULL,           -- 384 | 768 | 1024
    params          TEXT,                       -- JSON: 模型超参数
    status          TEXT DEFAULT 'idle',        -- idle | training | active | error
    file_size       INTEGER DEFAULT 0,         -- 字节
    is_active       INTEGER DEFAULT 0,         -- 当前激活模型
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- 推理运行记录
CREATE TABLE bendy_dl_model_run (
    id              TEXT PRIMARY KEY,
    model_id        TEXT NOT NULL,
    kind            TEXT NOT NULL,              -- 'embed' | 'recommend' | 'rebuild'
    input_count     INTEGER DEFAULT 0,
    output_count    INTEGER DEFAULT 0,
    metrics         TEXT,                       -- JSON: {duration_ms, avg_score, ...}
    status          TEXT DEFAULT 'running',    -- running | succeeded | failed
    error_msg       TEXT,
    started_at      TEXT NOT NULL,
    finished_at     TEXT
);

-- 定时任务
CREATE TABLE bendy_dl_schedule (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,              -- 任务名
    task_type       TEXT NOT NULL,              -- 'rebuild_index' | 're_embed' | 'custom'
    cron_expr       TEXT,                       -- APScheduler cron 表达式
    interval_sec    INTEGER,                    -- 或用 interval 模式
    is_enabled      INTEGER DEFAULT 1,
    last_run_at     TEXT,
    next_run_at     TEXT,
    params          TEXT,                       -- JSON: 任务参数
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- 接口请求统计
CREATE TABLE bendy_dl_api_stats (
    id              TEXT PRIMARY KEY,
    api_name        TEXT NOT NULL,              -- 'import' | 'recommend' | 'admin'
    method          TEXT NOT NULL,              -- GET | POST | PUT | DELETE
    path            TEXT NOT NULL,
    status_code     INTEGER NOT NULL,           -- 200 | 400 | 500 ...
    duration_ms     INTEGER,
    error_msg       TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- 数据导入配置
CREATE TABLE bendy_dl_import_config (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,              -- 配置名
    import_type     TEXT NOT NULL,              -- 'api_pull' | 'api_push'
    api_url         TEXT,                       -- 拉取数据源 URL
    api_key         TEXT,                       -- 认证 key
    api_headers     TEXT,                       -- JSON: 自定义 headers
    is_enabled      INTEGER DEFAULT 1,
    pull_interval   INTEGER DEFAULT 3600,      -- 拉取间隔（秒）
    last_pull_at    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- 推荐接口配置
CREATE TABLE bendy_dl_recommend_config (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    is_enabled      INTEGER DEFAULT 1,
    auth_enabled    INTEGER DEFAULT 0,          -- 是否启用请求认证
    auth_token      TEXT,                       -- Bearer token
    max_results     INTEGER DEFAULT 100,        -- 单次最大返回数
    min_score       REAL DEFAULT 0.3,          -- 最低相似度阈值
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
```

### 4.4 SQLite 健康监控表

```sql
CREATE TABLE bendy_dl_health (
    id              TEXT PRIMARY KEY,
    check_type      TEXT NOT NULL,              -- 'sqlite_integrity' | 'chroma_status' | 'disk' | 'memory'
    status          TEXT NOT NULL,              -- 'ok' | 'warning' | 'error'
    detail          TEXT,                       -- JSON: 检查详情
    checked_at      TEXT DEFAULT (datetime('now'))
);
```

---

## 5. 接口设计

### 5.1 数据导入接口

#### 5.1.1 推送式导入（与主站导入接口对齐）

```
POST /api/dl/import
Content-Type: application/json
Authorization: Bearer <token>

Body: [
  {
    "bookmark_id": "uuid-v4",
    "url": "https://example.com",
    "bookmark_title": "用户设定的书签名",
    "folder_path": "Bookmarks bar/技术/前端",
    "date_added": "1714000000000",
    "page_title": "页面 title 内容",
    "page_description": "页面 meta description",
    "page_text": "正文文字节选（最多2000字）",
    "generated_title": "AI 生成的简洁标题",
    "generated_description": "AI 生成的内容摘要",
    "tags": "标签1,标签2,标签3",
    "is_private": false,
    "lang": "zh"
  }
]

Response 200:
{
  "ok": true,
  "imported": 42,
  "skipped": 3,
  "errors": [{"index": 5, "reason": "url is required"}]
}
```

字段映射规则与主站 `import-service.ts` 的 `BookmarkInput` → `BookmarkDraft` 完全一致：
- `bookmark_title` → `title`（优先级：bookmark_title > generated_title > page_title > url）
- `tags` 保留逗号分隔原始字符串
- `date_added` 支持 Unix 秒 / 毫秒自动识别
- 批量上限 2000 条 / 次

#### 5.1.2 拉取式导入（从主站 API 定期拉取）

```
配置 bendy_dl_import_config 表，APScheduler 定时执行：

1. GET <主站>/api/bookmarks/export?since=<last_pull_at>
   → 获取增量书签列表
2. 逐条映射写入 bendy_bookmark
3. 新增 / 变更的书签 → 加入嵌入队列
4. 更新 last_pull_at
```

### 5.2 推荐接口

```
POST /api/dl/recommend
Content-Type: application/json
Authorization: Bearer <token>

Body:
{
  "tags": "前端,React,TypeScript",
  "user_id": "可选，用于个性化过滤",
  "max_results": 100,
  "min_score": 0.3,
  "exclude_ids": ["id1", "id2"],    // 排除已知书签
  "lang": "zh"                       // 可选语言过滤
}

Response 200:
{
  "ok": true,
  "total": 98,
  "items": [
    {
      "id": "bookmark-id",
      "url": "https://...",
      "title": "...",
      "tags": "前端,Vue,组件化",
      "page_description": "...",
      "score": 0.87,
      "matched_tags": ["前端"]
    }
  ],
  "model_version": "all-MiniLM-L6-v2-v1",
  "query_latency_ms": 45
}
```

推荐算法流程：

```
1. 解析 tags → 标签列表
2. 拼接查询文本: tags + (user_id 对应的近期书签 title)
3. 查询文本 → 嵌入模型 → 查询向量
4. ChromaDB 向量相似度检索 Top-(max_results × 1.5)
5. 元数据过滤: is_public=1, status='active', deleted_at IS NULL
6. 排除 exclude_ids
7. 标签匹配加分: 与请求 tags 有交集的 +0.1 score
8. 按 score 降序截取 max_results 条
9. 返回结果
```

### 5.3 管理后台 API

#### 5.3.1 系统概览

```
GET /api/dl/admin/dashboard

Response:
{
  "import_api_calls": 1234,
  "recommend_api_calls": 5678,
  "success_count": 6800,
  "fail_count": 23,
  "error_count": 5,
  "model_count": 3,
  "model_total_size_bytes": 536870912,
  "sqlite_health": {
    "status": "ok",
    "size_mb": 12.5,
    "wal_size_mb": 0.3,
    "integrity_check": "ok",
    "last_vacuum": "2026-04-23T00:00:00Z"
  },
  "daily_stats": [
    {"date": "2026-04-22", "import": 45, "recommend": 230, "success": 270, "fail": 5},
    {"date": "2026-04-21", "import": 38, "recommend": 198, "success": 232, "fail": 4}
  ]
}
```

#### 5.3.2 模型管理

```
# 模型列表
GET /api/dl/admin/models

# 模型详情
GET /api/dl/admin/models/:id

# 新建模型（= 新建训练任务）
POST /api/dl/admin/models
Body: {
  "name": "中文嵌入模型 v2",
  "model_type": "embedding",
  "model_version": "text2vec-base-chinese-v2",
  "vector_dim": 768,
  "params": {"batch_size": 32, "epochs": 10}
}
→ 创建 bendy_dl_model 记录 + 创建训练任务
→ 训练完成后 status → 'active'

# 修改模型参数
PUT /api/dl/admin/models/:id
Body: {
  "name": "新名称",
  "params": {"batch_size": 64}
}

# 删除模型（物理删除文件 + DB 记录）
DELETE /api/dl/admin/models/:id

# 激活模型（切换当前使用的模型）
POST /api/dl/admin/models/:id/activate
```

#### 5.3.3 数据管理

```
# 获取导入配置列表
GET /api/dl/admin/import-configs

# 新增/修改导入配置
POST /api/dl/admin/import-configs
PUT /api/dl/admin/import-configs/:id
Body: {
  "name": "主站拉取",
  "import_type": "api_pull",
  "api_url": "https://bendy.example.com/api/bookmarks/export",
  "api_key": "xxx",
  "is_enabled": true,
  "pull_interval": 3600
}

# 删除导入配置
DELETE /api/dl/admin/import-configs/:id

# 获取推荐接口配置
GET /api/dl/admin/recommend-configs

# 修改推荐接口配置
PUT /api/dl/admin/recommend-configs/:id
Body: {
  "is_enabled": true,
  "auth_enabled": true,
  "auth_token": "new-token",
  "max_results": 100,
  "min_score": 0.3
}

# 手动触发一次数据拉取
POST /api/dl/admin/import-configs/:id/trigger

# 数据统计（书签总数、向量覆盖率等）
GET /api/dl/admin/data-stats
```

#### 5.3.4 定时任务管理

```
# 任务列表
GET /api/dl/admin/schedules

# 新增任务
POST /api/dl/admin/schedules
Body: {
  "name": "夜间索引重建",
  "task_type": "rebuild_index",
  "cron_expr": "30 23 * * *",           // 或
  "interval_sec": null,
  "is_enabled": true,
  "params": {"full_scan": true}
}

# 修改任务
PUT /api/dl/admin/schedules/:id

# 删除任务
DELETE /api/dl/admin/schedules/:id

# 手动触发任务
POST /api/dl/admin/schedules/:id/trigger

# 查看任务执行历史
GET /api/dl/admin/schedules/:id/runs
```

---

## 6. 定时任务设计

### 6.1 夜间重组任务（核心任务）

```
调度窗口：每日 23:30 – 次日 05:30

实现方式：APScheduler CronTrigger
  - 主任务: cron = "30 23 * * *"  (23:30 启动)
  - 守护检查: cron = "0 0,1,2,3,4,5 * * *" (每小时检查是否超时)

任务步骤:
1. SQLite 全表扫描 bendy_bookmark (status='active', deleted_at IS NULL)
2. 标签整理:
   a. tags 字段清洗: 去空白、统一分隔符、去重
   b. 同义词合并: 配置同义词表 (如 "js" = "javascript")
   c. 标签频次统计 → 写入标签频次缓存
3. 重新嵌入:
   a. 逐批读取 page_title + page_description + page_text + tags
   b. 嵌入模型 → 向量
   c. 写入 ChromaDB（upsert）
   d. 批量大小: CPU 模式 16条/批, GPU 模式 128条/批
4. 索引重建:
   a. ChromaDB 重建 HNSW 索引
   b. 记录 bendy_dl_model_run
5. 健康检查:
   a. SQLite PRAGMA integrity_check
   b. 记录 bendy_dl_health
6. 清理:
   a. 删除 90 天前的 api_stats 记录
   b. SQLite VACUUM (如果碎片率 > 20%)
```

### 6.2 其他定时任务

| 任务 | 默认调度 | 说明 |
| ---- | ---- | ---- |
| `incremental_embed` | 每 6 小时 | 对新增/变更书签做增量嵌入 |
| `api_pull` | 按配置间隔 | 从主站拉取增量数据 |
| `health_check` | 每 30 分钟 | SQLite + ChromaDB + 磁盘空间检查 |
| `stats_aggregate` | 每日 00:10 | 聚合前一日 api_stats 到日级统计 |

所有定时任务均注册到 `bendy_dl_schedule` 表，支持 CRUD + 手动触发。
任务执行记录写入 `bendy_dl_model_run`。

---

## 7. 配置文件设计

### 7.1 主配置 `config.yaml`

```yaml
# bendy-nav-dl 主配置
server:
  host: "0.0.0.0"
  port: 8900
  workers: 1                       # CPU 模式建议 1 worker
  cors_origins:
    - "https://bendy.example.com"
  admin_token: "change-me"         # 管理接口认证 token

mode:
  # cpu | gpu
  device: "cpu"

  # CPU 模式下的资源限制
  cpu:
    max_memory_mb: 768             # 最大可用内存 MB（留 256MB 给系统）
    batch_size: 16                 # 嵌入批大小
    fallback_model: "all-MiniLM-L6-v2"   # 极端条件下的兜底模型

  # GPU 模式
  gpu:
    device_id: 0
    batch_size: 128
    model: "BAAI/bge-m3"

# 自动检测: 如果检测到 CUDA 可用，自动升级模型
auto_upgrade: true

database:
  sqlite:
    path: "./data/bendy_dl.db"
    wal_mode: true
    busy_timeout: 5000
    journal_size_limit_mb: 50
  chroma:
    path: "./data/chroma"
    collection: "bookmarks"
    # 降级模式: 当内存不足时切换到 numpy + SQLite BLOB
    fallback_to_numpy: true

embedding:
  # 当前激活的嵌入模型（启动时加载）
  active_model: "all-MiniLM-L6-v2"
  models:
    all-MiniLM-L6-v2:
      dim: 384
      max_seq_length: 256
      memory_mb: 80
    text2vec-base-chinese:
      dim: 768
      max_seq_length: 256
      memory_mb: 400
    BAAI/bge-m3:
      dim: 1024
      max_seq_length: 8192
      memory_mb: 2200

recommend:
  max_results: 100
  min_score: 0.3
  tag_match_bonus: 0.1

schedule:
  # 夜间重组窗口
  rebuild:
    start: "23:30"
    end: "05:30"
    cron_start: "30 23 * * *"
  # 增量嵌入
  incremental_embed:
    cron: "0 */6 * * *"
  # 健康检查
  health_check:
    interval_sec: 1800

logging:
  level: "INFO"
  path: "./data/logs/bendy_dl.log"
  rotation: "10 MB"
  retention: "30 days"
```

### 7.2 环境变量覆盖

所有 `config.yaml` 键均支持环境变量覆盖，规则：
`BENDY_DL_` 前缀 + 双下划线层级分隔 + 大写

```bash
BENDY_DL_MODE__DEVICE=gpu
BENDY_DL_SERVER__PORT=8901
BENDY_DL_DATABASE__SQLITE__PATH=/data/bendy_dl.db
```

---

## 8. 项目目录结构

```
bendy-nav-dl/
├── config.yaml                    # 主配置文件
├── config.example.yaml            # 示例配置
├── Dockerfile                     # Docker 构建（CPU）
├── Dockerfile.gpu                 # Docker 构建（GPU）
├── docker-compose.yaml            # 编排文件
├── pyproject.toml                 # 依赖管理 (poetry / pdm)
├── requirements.txt               # pip 依赖
│
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI 入口 + 生命周期
│   ├── config.py                  # Pydantic Settings 配置加载
│   │
│   ├── api/                       # API 路由层
│   │   ├── __init__.py
│   │   ├── router.py              # 总路由注册
│   │   ├── import_api.py          # 数据导入接口
│   │   ├── recommend_api.py       # 推荐接口
│   │   └── admin/                 # 管理后台 API
│   │       ├── __init__.py
│   │       ├── dashboard_api.py   # 系统概览
│   │       ├── model_api.py       # 模型管理
│   │       ├── data_api.py        # 数据管理
│   │       └── schedule_api.py    # 定时任务管理
│   │
│   ├── core/                      # 核心业务层
│   │   ├── __init__.py
│   │   ├── embedding.py           # 嵌入模型管理 + 推理
│   │   ├── recommend.py           # 推荐算法
│   │   ├── importer.py            # 数据导入逻辑
│   │   └── tag_processor.py       # 标签清洗 + 同义词合并
│   │
│   ├── db/                        # 数据层
│   │   ├── __init__.py
│   │   ├── sqlite_models.py       # SQLAlchemy ORM 模型
│   │   ├── sqlite_session.py      # 异步 Session 工厂
│   │   ├── chroma_client.py       # ChromaDB 客户端封装
│   │   └── health.py              # 数据库健康检查
│   │
│   ├── scheduler/                 # 定时任务
│   │   ├── __init__.py
│   │   ├── manager.py             # APScheduler 封装
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── rebuild_index.py   # 夜间重组
│   │   │   ├── incremental_embed.py  # 增量嵌入
│   │   │   ├── api_pull.py        # 数据拉取
│   │   │   ├── health_check.py    # 健康检查
│   │   │   └── stats_aggregate.py # 统计聚合
│   │   └── registry.py            # 任务注册中心
│   │
│   ├── middleware/                 # 中间件
│   │   ├── __init__.py
│   │   ├── auth.py                # 请求认证
│   │   └── stats.py               # 接口统计记录
│   │
│   └── utils/                     # 工具
│       ├── __init__.py
│       └── memory_guard.py        # 内存看门狗（1c1g 下关键）
│
├── data/                          # 运行时数据（.gitignore）
│   ├── bendy_dl.db
│   ├── chroma/
│   └── logs/
│
├── tests/
│   ├── conftest.py
│   ├── test_import_api.py
│   ├── test_recommend_api.py
│   ├── test_embedding.py
│   ├── test_scheduler.py
│   └── test_admin_api.py
│
└── scripts/
    ├── seed.py                    # 初始化种子数据
    └── benchmark.py               # 性能基准测试
```

---

## 9. Docker 部署方案

### 9.1 CPU 镜像

```dockerfile
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local
COPY . /app

WORKDIR /app

# 1c1g 限制下: 1 worker, 限制内存
ENV BENDY_DL_MODE__DEVICE=cpu
ENV BENDY_DL_SERVER__WORKERS=1

VOLUME ["/app/data"]
EXPOSE 8900

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8900", "--workers", "1"]
```

### 9.2 GPU 镜像

```dockerfile
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3-pip sqlite3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.gpu.txt .
RUN pip install --no-cache-dir -r requirements.gpu.txt

COPY . /app

ENV BENDY_DL_MODE__DEVICE=gpu
VOLUME ["/app/data"]
EXPOSE 8900

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8900"]
```

### 9.3 docker-compose.yaml

```yaml
version: "3.8"

services:
  bendy-nav-dl:
    build:
      context: .
      dockerfile: Dockerfile       # 或 Dockerfile.gpu
    container_name: bendy-nav-dl
    restart: unless-stopped
    ports:
      - "8900:8900"
    volumes:
      - dl-data:/app/data
      - ./config.yaml:/app/config.yaml:ro
    environment:
      - BENDY_DL_MODE__DEVICE=cpu   # 改为 gpu 切换模式
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1024M            # 1c1g 极限
        reservations:
          cpus: "0.5"
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8900/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  dl-data:
```

---

## 10. 1c1g 极限运行策略

### 10.1 内存预算（1024MB 总量）

| 组件 | 预估占用 | 说明 |
| ---- | ---- | ---- |
| Python 进程基础 | ~30MB | |
| FastAPI + uvicorn | ~20MB | 1 worker |
| SQLAlchemy + aiosqlite | ~10MB | |
| APScheduler | ~5MB | |
| ChromaDB 客户端 | ~30MB | 索引按需加载 |
| 嵌入模型 (MiniLM) | ~80MB | 384 维，首次推理时加载 |
| 请求处理缓冲 | ~50MB | 单并发控制 |
| 系统预留 | ~256MB | OS + SQLite 缓存 |
| **合计** | **~481MB** | **剩余 ~543MB 余量** |

### 10.2 关键策略

1. **模型懒加载**：嵌入模型仅在首次请求时加载，夜间重组期间保持加载；
   空闲 30 分钟后卸载释放内存。
2. **单并发控制**：uvicorn 1 worker + asyncio 信号量限制并发请求数为 2。
3. **批量逐批处理**：夜间重组时逐批 16 条嵌入，不一次性加载全表。
4. **SQLite WAL 模式**：读写不互斥，重组期间推荐接口仍可响应。
5. **ChromaDB 惰性加载**：索引文件 mmap 映射，不预加载到内存。
6. **内存看门狗**：`memory_guard.py` 每 60 秒检查 RSS，
   超过 750MB 时触发紧急回收（卸载模型 + ChromaDB 索引 + gc.collect()）。
7. **磁盘空间守卫**：6GB 硬盘下，日志保留 7 天，统计记录保留 90 天，
   数据库超 1GB 时自动 VACUUM。

### 10.3 CPU 推理性能预估（1 核）

| 操作 | 数据量 | 耗时 |
| ---- | ---- | ---- |
| 单条嵌入 (MiniLM, 384d) | 1 条 | ~50ms |
| 批量嵌入 | 16 条 | ~300ms |
| ChromaDB 向量检索 | Top 150 / 10 万条库 | ~20ms |
| 推荐接口全链路 | 100 条返回 | ~150ms |
| 夜间全表重组 | 1000 条书签 | ~25 分钟 |
| 夜间全表重组 | 10000 条书签 | ~4 小时 |

---

## 11. 依赖清单

### 11.1 CPU 模式 `requirements.txt`

```
# Web
fastapi>=0.110,<1.0
uvicorn[standard]>=0.29,<1.0
python-multipart>=0.0.9

# ORM + DB
sqlalchemy[asyncio]>=2.0,<3.0
aiosqlite>=0.20,<1.0

# Vector DB
chromadb>=0.5,<1.0

# Embedding
sentence-transformers>=3.0,<4.0
torch>=2.2,<3.0              # CPU only

# Scheduler
apscheduler>=3.10,<4.0

# Config
pydantic>=2.0,<3.0
pydantic-settings>=2.0,<3.0
pyyaml>=6.0,<7.0

# Logging
loguru>=0.7,<1.0

# Utils
httpx>=0.27,<1.0             # 异步 HTTP 客户端（拉取数据用）
numpy>=1.26,<2.0
```

### 11.2 GPU 模式额外依赖 `requirements.gpu.txt`

```
-r requirements.txt
torch>=2.2,<3.0              # CUDA 版本（pip 自动选 CUDA wheel）
```

或直接安装：
```bash
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

---

## 12. 主站对接方案

### 12.1 主站需要新增的内容

在 bendy-nav-nextjs 中需要新增以下内容：

1. **管理后台页面** `src/features/admin/dl/`：
   - 系统概览页：读取 DL 服务 `/api/dl/admin/dashboard` 数据渲染
   - 模型管理页：CRUD 操作调用 DL 服务 API
   - 数据管理页：导入配置 + 推荐配置管理
   - 定时任务页：任务列表 + 执行历史

2. **推荐消费接口** `src/server/ai/recommend-proxy.ts`：
   - `GET /api/home/ai-recommendations?tags=xxx`
   - 内部转发到 DL 服务 `POST /api/dl/recommend`
   - 返回格式与现有 `listPublicRecommendedBookmarks` 对齐

3. **数据推送钩子**（可选）：
   - 书签导入时，除写入主站 DB，同时 `POST` 到 DL 服务 `/api/dl/import`
   - 由 `bendy_system_config` 开关控制是否启用

4. **环境配置**：
   ```env
   DL_SERVICE_URL=http://bendy-nav-dl:8900
   DL_SERVICE_TOKEN=change-me
   ```

### 12.2 通信流程

```
主站 (NextJS)                      DL 服务 (Python)
    │                                    │
    │── POST /api/dl/import ──────────→  │  (推送书签)
    │←──── 200 {imported: N} ─────────── │
    │                                    │
    │── POST /api/dl/recommend ────────→ │  (请求推荐)
    │←──── 200 {items: [...]} ────────── │
    │                                    │
    │── GET /api/dl/admin/dashboard ──→  │  (管理数据)
    │←──── 200 {stats: ...} ──────────── │
    │                                    │
    │         ← GET /api/bookmarks/export│  (拉取书签)
    │── 200 [{bookmark...}] ─────────→   │
```

---

## 13. 开发阶段与任务拆解

### Phase 0：项目脚手架（1 天）

| 任务 | 产出 |
| ---- | ---- |
| 初始化 Python 项目结构 | pyproject.toml + 目录骨架 |
| 配置加载系统 | config.py + Pydantic Settings |
| SQLite 初始化 + ORM 模型 | sqlite_models.py + 迁移脚本 |
| FastAPI 入口 + 健康检查 | main.py + /health |

### Phase 1：数据导入（2 天）

| 任务 | 产出 |
| ---- | ---- |
| 推送式导入接口 | POST /api/dl/import |
| 字段映射逻辑（对齐主站 import-service.ts） | importer.py |
| 拉取式导入逻辑 | api_pull.py |
| 导入配置管理 CRUD | admin/data_api.py |
| 接口统计中间件 | middleware/stats.py |

### Phase 2：嵌入 + 向量存储（2 天）

| 任务 | 产出 |
| ---- | ---- |
| 嵌入模型管理器（加载/卸载/切换） | embedding.py |
| ChromaDB 客户端封装 | chroma_client.py |
| 增量嵌入逻辑 | incremental_embed.py |
| numpy + SQLite BLOB 降级方案 | chroma_client.py 分支 |

### Phase 3：推荐接口（1.5 天）

| 任务 | 产出 |
| ---- | ---- |
| 推荐算法实现 | recommend.py |
| 推荐接口 | POST /api/dl/recommend |
| 标签处理 + 同义词 | tag_processor.py |
| 推荐配置管理 | admin/data_api.py |

### Phase 4：定时任务（1.5 天）

| 任务 | 产出 |
| ---- | ---- |
| APScheduler 封装 + 任务注册 | scheduler/manager.py + registry.py |
| 夜间重组任务 | rebuild_index.py |
| 健康检查任务 | health_check.py |
| 统计聚合任务 | stats_aggregate.py |
| 任务管理 CRUD | admin/schedule_api.py |

### Phase 5：管理后台 API（2 天）

| 任务 | 产出 |
| ---- | ---- |
| 系统概览接口 | admin/dashboard_api.py |
| 模型管理 CRUD | admin/model_api.py |
| 认证中间件 | middleware/auth.py |
| 内存看门狗 | utils/memory_guard.py |
| SQLite 健康检查 | db/health.py |

### Phase 6：Docker + 部署 + 对接（1 天）

| 任务 | 产出 |
| ---- | ---- |
| Dockerfile (CPU + GPU) | 两个 Dockerfile |
| docker-compose.yaml | 编排文件 |
| 主站对接文档 + 示例 | README 对接章节 |

### Phase 7：主站 admin 页面（2 天，在 bendy-nav-nextjs 仓库中）

| 任务 | 产出 |
| ---- | ---- |
| DL 管理后台页面路由 | src/features/admin/dl/ |
| 系统概览页 + 每日请求统计图 | dashboard 组件 |
| 模型管理页 | model 组件 |
| 数据管理页 | data 组件 |
| 定时任务页 | schedule 组件 |
| 推荐代理接口 | recommend-proxy.ts |

**总预估：~13 天**（其中 DL 服务本身 ~11 天，主站对接 ~2 天）

---

## 14. 与 v0.1 草案的差异对照

| 项目 | v0.1 草案 | v0.2 本方案 |
| ---- | ---- | ---- |
| **部署形态** | NextJS 内嵌模块 | 独立 Python 服务 |
| **标签数据来源** | 直读主站 PostgreSQL/SQLite | 独立 SQLite，通过 API 同步 |
| **向量数据库** | Prisma Json 字段 | ChromaDB（可降级 numpy+SQLite） |
| **推荐算法** | GRU 序列建模 | 静态标签 + 文本向量相似度 |
| **嵌入模型** | BGE-M3 + GRU | sentence-transformers（多模型可选） |
| **定时任务** | Node cron / 外部调度 | APScheduler（Python 内置） |
| **管理后台** | 在主站 /admin/ai | DL 服务提供 API，主站只渲染页面 |
| **CPU/GPU 模式** | 无 | 配置文件切换 + 自动降级 |
| **极限部署** | 无考虑 | 1c1g6G 全链路保障 |
| **数据导入** | 只读主站 DB | 推送 + 拉取双口径 |

---

## 15. 风险与后续

1. **数据同步延迟**：推送模式依赖主站钩子，拉取模式有间隔；
   → 关键场景可双管齐下，推荐接口在本地数据不足时返回降级结果。
2. **向量库内存**：ChromaDB 在 10 万+ 向量时内存可能超标；
   → 启用 numpy + SQLite BLOB 降级，或引入 Qdrant single-binary。
3. **CPU 模式推荐质量**：MiniLM 384 维向量中文语义表达有限；
   → 可通过标签匹配加分弥补；条件允许时升级 text2vec-base-chinese。
4. **夜间重组超时**：万级书签在 CPU 模式下可能超过 6 小时窗口；
   → 任务支持断点续做（记录已处理 ID），超时不强杀，下一时段继续。
5. **后续可演进**：
   - 标签数据量增长后，SQLite 可迁移至 PostgreSQL
   - ChromaDB 可替换为 Qdrant / Milvus
   - 可加入 GRU/LSTM 用户行为序列建模（回到 v0.1 路线）
   - 可加入商用 LLM 摘要能力（对应 v0.1 的路线 B）
