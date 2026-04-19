# 后台开发计划（Admin Backend Development Plan）

> 配套文档：`docs/admin-backend-spec.md`
> 起始日期：2026-04-17
> 分支策略：每个 F 阶段从 `dev` 拉 `feat/admin-<stage>` 分支，完成后合并回 `dev`；小版本号递增。

## 里程碑一览

| 阶段 | 产出 | 依赖 | 状态 |
| --- | --- | --- | --- |
| F1 | 基础设施：Prisma + 双 DB 切换 + CacheDriver + StorageDriver + `.env.example` 刷新 | — | ⬜ |
| F2 | GitHub OAuth 认证 + Session + 限流 + 首页登录入口改造 + 删除旧登录注册 | F1 | ⬜ |
| F3 | 后台壳层：`/admin` 布局、middleware、统一响应、错误码、审计管道 | F2 | ⬜ |
| F4 | 用户管理（列表/详情/启停/角色/删除/导出）+ 审计日志写入 | F3 | ⬜ |
| F5 | 内容管理：书签/卡片/页面（全局视角） + 壁纸库 + 默认模板编辑器 | F3 | ⬜ |
| F6 | 系统设置 + 备份/恢复（按 `BACKUP_ENABLED` 条件启用）+ 维护模式 | F4/F5 | ⬜ |
| F7 | Dashboard 指标卡（轻量 SVG，不引 recharts） | F4 | ⬜ |
| F8 | Docker 三形态产物 + README 部署指南 + CI 脚本 | F1–F6 | ⬜ |

---

## F1 — 基础设施

- [ ] 安装 Prisma、@upstash/redis、argon2（保留以备后用）、pino、otpauth(暂留)、@aws-sdk/client-s3
- [ ] 卸载现有 `postgres` 包；迁移 `src/server/infrastructure/db/client.ts` 到 Prisma
- [ ] 新建 `prisma/schema.prisma`，`provider = env("DATABASE_PROVIDER")`
- [ ] 生成 V0 schema：User / Session / AuditLog / Page / Link / LinkFolder / Dock / Wallpaper / Setting / SearchEngine / UserSearchEngine / PluginTodo / DefaultTemplate / SystemConfig（全部 `@@map("bendy_*")`）
- [ ] `prisma/seed.ts`：写入默认 SearchEngine、默认 Wallpaper、默认 Template
- [ ] 重写 `src/server/infrastructure/cache`：`driver.ts` 接口 + `upstash.ts` + `memory.ts`（复用现有 ttl-cache 实现）+ `index.ts` 工厂
- [ ] 新建 `src/server/infrastructure/storage`：`local.ts` + `s3.ts` + `index.ts`
- [ ] 刷新 `.env.example`（按 spec §8）；删除 SMTP 相关项
- [ ] `package.json` 新增脚本：`prisma:generate` / `prisma:migrate` / `db:seed`
- [ ] `typecheck` + `build` 通过

## F2 — GitHub OAuth + 登录改造

- [ ] `src/server/auth/github.ts`：authorize URL、code 换 token、拉 user + emails
- [ ] `src/server/auth/session.ts`：JWT 签/验、refresh 吊销
- [ ] `src/server/auth/rate-limit.ts`：OAuth 回调 10次/min/IP
- [ ] `app/api/auth/github/start/route.ts`、`callback/route.ts`、`logout/route.ts`、`refresh/route.ts`、`reauth/route.ts`
- [ ] middleware `requireAuth`、`requireRole`、`requireReauth`
- [ ] 首页登录入口：删除邮箱/密码/验证码 UI，保留单一 "使用 GitHub 登录" 按钮
- [ ] **删除**旧接口：`LoginByEmail` / `Register` / `SendEmailCode` / `ResetPassword` 等（逐个枚举再删）
- [ ] 设置页新增 "管理后台" 入口（仅管理员可见）
- [ ] 单元测试：GitHub token 交换 mock、session 签吊销、限流计数
- [ ] 覆盖率 ≥80%

## F3 — 后台壳层

- [ ] `app/admin/layout.tsx`：左菜单 + 顶栏 + 内容区（CSS Module）
- [ ] `app/admin/page.tsx`：dashboard 占位
- [ ] 统一响应工具 `src/server/shared/response.ts`
- [ ] 错误码表 `src/server/shared/error-codes.ts`（按 spec §6）
- [ ] 审计管道 `src/server/admin/audit/writer.ts`：`writeAudit(actorId, action, target, payload)`
- [ ] i18n admin 命名空间骨架

## F4 — 用户管理

- [ ] 列表：分页、搜索（login/email/name）、role/status 过滤
- [ ] 详情：基础资料 / 会话列表 / 最近登录 / 书签计数
- [ ] 操作：启用/禁用、吊销所有 session、改 role、软删
- [ ] 批量：CSV 导出、批量禁用
- [ ] 所有写操作写审计
- [ ] 测试：权限校验、审计写入

## F5 — 内容管理

- [ ] 书签/卡片/页面：按用户筛选的全局只读视图；维护模式开启后可写
- [ ] 默认模板编辑器：JSON schema 校验 + 预览 + 发布版本号
- [ ] 壁纸：上传（走 StorageDriver）/ 排序 / 删除 / 分类
- [ ] 插件目录维护（仅增删改显示元信息）

## F6 — 系统设置 + 备份

- [ ] 站点信息、备案号、Logo、维护模式开关
- [ ] 备份：`BACKUP_ENABLED=true` 时启动 cron；支持手动触发、列表、恢复
- [ ] 敏感配置变更走 re-auth

## F7 — Dashboard

- [ ] 用户总数、今日新增、在线会话、磁盘占用、近 30 天趋势（轻量 SVG）
- [ ] 最近 50 条审计日志

## F8 — Docker 与部署

- [ ] `docker/Dockerfile.pg`（Next.js standalone + prisma migrate deploy）
- [ ] `docker/Dockerfile.sqlite`（内置 better-sqlite3 + `/data` volume + `prisma db push`）
- [ ] `docker/docker-compose.pg.yml`
- [ ] `.dockerignore`
- [ ] `next.config.mjs` 开启 `output: 'standalone'`
- [ ] README 三种部署段落（VPS / 单容器 / Serverless）
- [ ] CI 本地脚本：`scripts/ci.sh`（typecheck + build + audit）

---

## 每阶段完成动作

1. `npm run typecheck` / `npm run build` / `npm audit` 全绿
2. 核心模块覆盖率 ≥80%
3. 更新 `maintain.md` 的版本条目
4. 更新本文件 checkbox
5. Conventional Commit 提交并推 `origin/feat/admin-<stage>`
6. PR 到 `dev`，用户审核合并
