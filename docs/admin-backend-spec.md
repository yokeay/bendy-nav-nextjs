# 后台管理与认证技术方案（Phase 5）

> 状态：草案 v1（待验收后开工）
> 日期：2026-04-17
> 范围：后台管理系统 + 登录注册改造 + 三种部署形态

## 0. 决策摘要（与用户已达成的一致）

| 项 | 决策 |
| --- | --- |
| ORM / 迁移 | **Prisma**，`schema.prisma` 单文件，`provider` 由 env 切换（postgresql / sqlite） |
| 主数据库 | **PostgreSQL**（个人/商业主力） + **SQLite**（Docker 单机/商业化小规格） |
| 缓存 | **Upstash Redis**（REST）为主；SQLite 模式允许与 Upstash 组合；提供 `memory` 兜底驱动仅用于本地开发 |
| 认证方式 | **仅 GitHub OAuth**。删除邮箱/密码/验证码登录注册全部链路 |
| 管理员判定 | env `ADMIN_GITHUB_EMAILS`（逗号分隔）；用户通过 GitHub 登录后邮箱命中则开启后台入口，入口落在**设置页面**内 |
| 首页用户登录 | 入口改为 "使用 GitHub 登录"，删除邮箱/密码/验证码 UI 与后端路由 |
| 后台 UI | 后台 `/admin` 延续 CSS Module 自建组件风格（不引入 Tailwind/shadcn）；`Agent.md` 第 4 条仅约束前台，后台自建轻量组件 |
| mtab 数据迁移 | **不做**，全新建库 |
| 部署形态 | 自托管 VPS / 容器平台单镜像（ClawCloud 等） / Vercel-like Serverless，共三种，由 README 指引 |
| 业务前缀 | `bendy_`（表名、Redis key、配置），可通过 `BUSINESS_PREFIX` env 改 |

## 1. 目标与非目标

### 目标
- 构建 `/admin` 后台：用户、书签/卡片/页面、壁纸、插件、审计日志、系统设置、备份。
- 以 GitHub OAuth 作为唯一身份来源，统一用户端与管理员端的登录入口。
- 一套代码三种部署：VPS、单容器平台、Serverless。

### 非目标
- 不迁移 mtab 历史数据。
- 不保留邮箱 / 密码 / 验证码 / 第三方（QQ / 微信）登录。
- 不做多租户、不做计费体系（后续再谈）。

## 2. 技术选型

| 层 | 选型 | 备注 |
| --- | --- | --- |
| ORM / Migrate | Prisma 5.x | `provider = env("DATABASE_PROVIDER")` 切 PG/SQLite |
| PG 驱动 | Prisma 内置 | 卸载现有 `postgres` npm 包 |
| SQLite 驱动 | `better-sqlite3`（Prisma 内置） | Docker 镜像预装 |
| 缓存 SDK | `@upstash/redis`（REST） | 无长连接，Serverless 友好 |
| 缓存接口 | `CacheDriver`：`upstash` / `memory` | 按 `CACHE_DRIVER` 切换 |
| 对象存储 | `StorageDriver`：`local` / `s3` | 壁纸/图标上传 |
| 会话 | JWT：access 15min + refresh 14d，httpOnly + SameSite=Lax cookie | 签发 `bendy_session` |
| OAuth | 原生实现（GitHub `authorize` + `access_token` + `user` + `user/emails`） | 不引入 NextAuth，避免抽象层太厚 |
| CSRF | OAuth state 参数 + cookie 双写校验 |  |
| 限流 | `CacheDriver` 原子计数（INCR+EXPIRE） | OAuth 回调、后台接口统一限流 |
| 测试 | Vitest + @testing-library | 核心模块 ≥80% |
| i18n | i18next（沿用现有方案） | 后台新增 `admin` 命名空间 |
| 日志 | `pino`（结构化 JSON） | 审计单独表 `bendy_audit_log` |

## 3. 认证与授权

### 3.1 登录流程（GitHub OAuth）
1. 前端点击 "GitHub 登录" → 跳 `/api/auth/github/start`
2. 服务端生成 `state`（随机 32 字节，写 httpOnly cookie `bendy_oauth_state`，缓存 `bendy:oauth:state:{state}=1 TTL 10min`），重定向 GitHub `authorize`
3. GitHub 回调 `/api/auth/github/callback?code&state`
4. 校验 state（cookie + 缓存双写一致）→ 换 access_token → 拉 `/user` + `/user/emails`（取 primary & verified）
5. `upsert` `bendy_user`（按 `github_id`）；写 login 历史
6. 判定管理员：`ADMIN_GITHUB_EMAILS` 命中 → 设置 `role=admin`/`superadmin`
7. 签发 session（access + refresh），写 cookie，重定向 `/`

### 3.2 管理员入口
- 不单独设 `/admin/login`；用户在首页设置页看到 "管理后台" 入口（仅 role ∈ {admin, superadmin} 时显示）
- `/admin/*` 由 middleware 校验 cookie → 解析 JWT → 查 role；不满足 403

### 3.3 敏感操作二次校验
- 删除用户、吊销全站 token、恢复备份等：要求 **在 5 分钟内重新通过 GitHub 授权一次**（re-auth）
- 不再做 TOTP（用户已要求只走 GitHub；TOTP 独立于 OAuth，成本/收益不划算；如后续确有需要再加）

### 3.4 Session
- access token 15min，refresh 14d
- refresh token 存 cache：`bendy:sess:{jti}`，吊销即删
- 登出清 cookie + 删 refresh

## 4. 数据模型（Prisma schema 关键表）

全部 `@@map("bendy_*")`。

- `BendyUser` — `id, githubId(unique), email, login, name, avatarUrl, role(user|admin|superadmin), status(active|disabled), createdAt, lastLoginAt`
- `BendySession` — `id, userId, jti, userAgent, ip, expiresAt, revokedAt`
- `BendyAuditLog` — `id, actorId, action, targetType, targetId, payload(Json), ip, createdAt`
- `BendyPage` — 用户首页页面集合
- `BendyLink` — 书签/卡片（含 `pageId`, `folderId`, `app`, `pageType`, `iconBg`, `bgColor`, 排序字段）
- `BendyLinkFolder` — 文件夹
- `BendyDock` — Dock 条
- `BendyWallpaper` — `id, url, category, order, uploadedBy, createdAt`
- `BendySetting` — `userId(unique), config(Json)` — 每用户的首页设置
- `BendySearchEngine` / `BendyUserSearchEngine`
- `BendyPluginTodo` / `BendyPluginTodoFolder`（保留插件位）
- `BendyDefaultTemplate` — 管理员发布的默认首页模板
- `BendySystemConfig` — 单行 key-value，站点信息、备案、维护模式

> PG/SQLite 兼容：所有 JSON 字段用 `Json` 类型；不使用 PG 专属函数；不依赖数据库级全文索引，搜索走 `contains` + 大小写归一。

## 5. 缓存策略

- Key：`bendy:{module}:{res}:{id}`，版本化 `:v1` 便于批量失效
- 写穿透：写库成功后主动 `del` 相关 key，不等 TTL 自然过期
- 会话/限流/OAuth state：只放缓存不落库
- 热点表（`BendyWallpaper` 列表、`BendySearchEngine`、`BendySystemConfig`）TTL 300s
- SQLite 并发保护：所有写操作必走 Prisma 单实例 + 事务；高频读命中 cache，不直接打数据库

## 6. 响应与错误码

- 统一结构：`{code: number, message: string, data?: any}`
- 成功：`code = 0`
- 错误码段：
  - `1xxx` 认证/授权：1001 未登录, 1002 无权限, 1003 OAuth 失败, 1004 re-auth 过期
  - `2xxx` 业务校验：2001 资源不存在, 2002 参数非法, 2003 冲突
  - `4xxx` 限流 / 配额
  - `5xxx` 服务端错误
- 集中在 `src/server/shared/error-codes.ts`

## 7. 目录结构（新增）

```
prisma/
  schema.prisma
  migrations/
  seed.ts
src/server/
  infrastructure/
    db/prisma.ts
    cache/{driver.ts, upstash.ts, memory.ts, index.ts}
    storage/{driver.ts, local.ts, s3.ts, index.ts}
    logger.ts
  auth/
    github.ts            # OAuth 客户端
    session.ts           # JWT 签发/校验
    rate-limit.ts
    middleware.ts        # requireAuth / requireRole / requireReauth
  admin/
    users/
    content/{links, wallpapers, templates, plugins}
    audit/
    settings/
    backup/
  shared/
    response.ts
    error-codes.ts
app/api/
  auth/github/{start, callback, logout, refresh, reauth}/route.ts
  admin/**
app/admin/
  layout.tsx
  page.tsx               # dashboard
  users/
  content/
  audit/
  settings/
docker/
  Dockerfile.pg          # PG 版镜像（无内置 DB）
  Dockerfile.sqlite      # SQLite 单机版（内置 volume /data）
  docker-compose.pg.yml
scripts/
  db-migrate.ts
  db-seed.ts
```

## 8. 环境变量（写进 `.env.example`）

```
# --- 核心 ---
PORT=3000
BUSINESS_PREFIX=bendy
APP_BASE_URL=https://nav.example.com   # OAuth 回调拼接用

# --- 数据库 ---
DATABASE_PROVIDER=postgresql           # postgresql | sqlite
DATABASE_URL=postgres://user:pwd@host:5432/bendy
# SQLite 示例：DATABASE_URL=file:./runtime/bendy.db

# --- 缓存 ---
CACHE_DRIVER=upstash                   # upstash | memory
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# --- 对象存储 ---
STORAGE_DRIVER=local                   # local | s3
STORAGE_LOCAL_DIR=./runtime/uploads
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=

# --- GitHub OAuth ---
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GITHUB_OAUTH_CALLBACK_PATH=/api/auth/github/callback

# --- 管理员 ---
ADMIN_GITHUB_EMAILS=owner@example.com,ops@example.com

# --- 安全 ---
SESSION_JWT_SECRET=                    # 32+ 字符随机
SESSION_ACCESS_TTL=900                 # 秒
SESSION_REFRESH_TTL=1209600

# --- 备份 ---
BACKUP_ENABLED=false
BACKUP_CRON=0 3 * * *
BACKUP_TARGET=local                    # local | s3
```

> 删除：`SMTP_*`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`、`AUTH_CODE`。

## 9. 部署三形态

### 形态 A — VPS / 自建服务器（Docker Compose）
- 镜像：`Dockerfile.pg`
- 编排：`docker-compose.pg.yml` 带 Postgres 服务；Upstash 走公网 REST
- 适合：自己的云服务器、群晖等

### 形态 B — 单容器平台（ClawCloud / Railway / Fly.io 等）
- 镜像：`Dockerfile.sqlite`（内置 SQLite，`/data` 挂载为持久 volume）
- Upstash Redis 仍建议接入（免费档即可），避免 SQLite 高并发读时抖动
- 适合：一键拉起、零运维

### 形态 C — Vercel / Netlify / Cloudflare Pages Functions（Serverless）
- DB：Neon / Supabase Postgres
- Cache：Upstash Redis（天然匹配 Serverless）
- 存储：必须 S3，不能用 local（文件系统非持久）
- 构建：标准 `next build`，不需额外 Dockerfile

三种形态差异通过 env 切换，代码无条件分支。

## 10. Docker 产物

### `docker/Dockerfile.pg`
- 基础：`node:22-alpine`
- 多阶段构建：deps → builder(`next build` + `prisma generate`) → runner
- 运行：`node server.js`（Next.js standalone 输出）
- 入口脚本：`prisma migrate deploy && node server.js`

### `docker/Dockerfile.sqlite`
- 同上，额外：
  - 安装 `better-sqlite3` 原生依赖
  - 声明 `VOLUME ["/data"]`，`DATABASE_URL=file:/data/bendy.db`
  - 入口：首次启动 `prisma db push` → `prisma db seed` → 启动

### `docker/docker-compose.pg.yml`
- services: `app`, `postgres:16`；`app` 依赖 `postgres`；暴露 3000 端口
- `.env` 通过 `env_file` 注入

## 11. 分支与发版

- 每个子阶段（F1–F8）从 `dev` 拉 `feat/admin-xxx` → 完成 → 回 `dev`
- `dev` 累积到可发版时合并到 `main` 并 tag（由用户验收）
- Commit 遵守 Conventional Commits

## 12. 测试与质量门

- `vitest` 覆盖 `auth/github`, `auth/session`, `auth/rate-limit`, `admin/users`, `admin/audit`
- 覆盖率 ≥80%
- CI 前门（本地先跑）：`npm run typecheck` / `npm run build` / `npm audit`

## 13. 风险与开放问题

1. **GitHub OAuth 在国内网络**：回调 / `api.github.com` 可能被墙。方案：允许 env 注入代理，文档里提示。
2. **SQLite 写并发**：Prisma + `better-sqlite3` 默认串行写；Upstash 承担热点读；极端并发场景仍建议 PG。
3. **首次启动没有管理员**：若 `ADMIN_GITHUB_EMAILS` 未配，后台入口永不出现；seed 脚本会在启动时打 warning。
4. **OAuth state 在 Serverless**：Edge/Lambda 之间共享 state 必须用 Upstash，不能依赖进程内存——方案已覆盖。

## 14. 验收口径

- 三种部署形态各拉起一次可用
- 用户端：GitHub 登录 → 首页正常 → 管理员邮箱进入后台
- 后台：用户列表、书签管理、壁纸、模板、审计、设置、备份各自跑通最小闭环
- 覆盖率达标，`npm run build` / `typecheck` / `audit` 通过
- README 更新完三种部署说明，`.env.example` 完整
