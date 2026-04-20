# Plan

## 2.4.39 Focus

- [x] Treat UI parity drift as a blocking bug and realign the largest visible mismatches with `latest/mtab`.
- [x] Restore Dock surface rendering to use the same `sideBackground` variable as the side rail.
- [x] Bring add/edit, card catalog, recommended links, and page manager dialogs back toward the legacy light `mtab custom` controls instead of the mismatched dark dialog skin.
- [x] Restore settings center sizing and mobile positioning parity, including the 600px high-panel breakpoint.
- [x] Match desktop and tile context-menu positioning constants to their actual legacy widths.
- [x] Separate the page manager component API from legacy `pageGroup` storage naming while preserving persisted fields.
- [x] Replace default compact recommendations with 笨迪导航 / 笨迪博客, point 笨迪导航 to `https://polofox.com`, and remove leftover default wide icon tags.
- [x] Replace 360 search fallbacks with DuckDuckGo in the active search-engine mapping path.
- [x] Replace the login visual and favicon/logo PNG assets with the updated `docs` assets.
- [x] Add `pageType` to desktop page objects with `normal` / `geek` creation and editing support.
- [x] Implement the first inline-window path for `app = 1` desktop, Dock, and folder tags.
- [ ] Continue the broader 1:1 pass over folder modal and remaining control-center field order after visual verification is available.

## 2.4.38 Focus

- [x] Wire `LinkTitle` into the Next.js home rendering path so hidden label mode no longer renders tile names.
- [x] Collapse grid and folder rows back to pure icon height while `LinkTitle` is disabled, avoiding the previous empty label gutter.
- [x] Reconnect `iconBg` fallback semantics: explicit `bgColor` still wins, otherwise the default icon plate appears only when `iconBg` is enabled.
- [x] Continue Phase 1 by replacing remaining "group" user-facing wording with "page" wording across page manager, sidebar, and settings flows.
- [x] Continue Phase 1 by separating internal page-management names from legacy `pageGroup` storage fields where it can be done without breaking persisted data.

## 2.4.37 Focus

- [x] Reconnect `pageGroupPosition` to the Next.js home sidebar so the side rail can actually switch left/right.
- [x] Reorder settings fields toward the legacy home controller, especially `Dock / 侧栏`, wallpaper opacity, and time field order.
- [x] Restore `opacity` to the wallpaper mask semantics instead of the broken 0-100 pseudo card opacity slider.
- [x] Reconnect `sideBackground` to the sidebar style and settings entry.
- [x] Continue closing the remaining gaps around `LinkTitle` and exact per-field parity with `latest/mtab`.

## 2.4.36 Focus

- [x] 清理 `home-actions.tsx` 中遗留的旧添加/编辑弹层实现，确保 `home-link-editor-dialog.tsx` 成为唯一生效入口。
- [x] 给壁纸库和页面图标选择器的旧接口读取补上数组兜底，避免异常响应直接打断弹层渲染。
- [ ] 继续对齐设置页字段顺序，与 `latest/mtab` 逐项收口。

## 2.4.35 Focus

- [x] Tighten add/edit dialog tab bar, form gaps, and select styling toward `mtab custom`.
- [x] Continue refining settings center control textures and row density.
- [ ] Keep closing the gap on exact settings field order and removal of legacy add-dialog implementation.

## 2.4.34 Focus

- [x] Reset settings center to `个人中心` each time it opens.
- [x] Compress settings rows into `mtab`-like white 45px control rows with lighter hierarchy.
- [x] Tighten menu/user card hover, switch, range, and action-row details toward the `mtab` / macOS feel.
- [ ] Continue closing the gap on settings field order and add/edit dialog pixel parity.

## 2.4.33 Focus

- [x] Merge `添加标签 / 推荐标签 / 添加卡片` into one dialog.
- [x] Support choosing the target page before adding a tag or card.
- [x] Reconnect add-tag flow to `LinkStore/list`, `LinkStore/getIcon`, and `LinkStore/push`.
- [ ] Keep tightening add/edit dialog density, icon picker spacing, and settings-page parity with `latest/mtab`.

当前版本：`2.4.39`

## 总目标

- [ ] 新版首页不是“参考旧版”，而是“以兼容模式首页为唯一基线进行 1:1 复刻”。
- [ ] 所有视觉、交互、信息结构、持久化结果、设置行为都要优先对齐兼容模式，再谈现代化重构。
- [ ] 现代化重构只允许发生在“底层模型、组件拆分、工程结构、可扩展性”层面，不能改变兼容模式对用户可见的行为结论。

## 核心边界

- [ ] 兼容模式入口不再作为新版主路径的一部分暴露给用户，兼容模式只作为内部校准基线。
- [ ] 设计优先于编码，但设计边界必须来自真实问题、真实对照和明确约束，不能凭空发散。
- [ ] 所有新增抽象都必须服务于后续页面扩展、设置扩展、卡片扩展和窗口容器扩展，不能为了“抽象而抽象”。
- [ ] 每次迭代结束必须更新 `maintain.md` 与 `plan.md`，确保方向和状态不漂移。

## 已完成基线

- [x] 根路径已经由 Next.js 首页承接，不再直接回落到 legacy `dist/index.html`。
- [x] 首页数据读取层、访客本地存储与登录态服务端写回链路已打通。
- [x] 首页动作卡 `添加标签 / 壁纸 / 设置` 已接回新版。
- [x] Dock 的加入、删除、重排已具备基础能力。
- [x] 文件夹子项的基础维护与拖入文件夹链路已接回新版。
- [x] 首页卡片模型工具层已建立，开始承接卡片类型、能力和排序判断。
- [x] 简洁模式下搜索框已回到“左侧图标式搜索引擎入口 + 右侧纯搜索按钮”的结构。
- [x] 长按卡片进入全局编辑模式已接入。
- [x] 新壁纸库已复制进项目静态目录，默认壁纸已切到 `country`。
- [x] 设置中心壳层已切到旧版控制中心方向，不再是居中模态框。

## 当前剩余工作总表

### A. 首页视觉 1:1

- [ ] 对齐主网格真实列数、顶部留白、搜索框宽度、时间区位置与间距。
- [ ] 对齐 1x1 / 1x2 / 2x2 / 2x4 卡片的真实尺寸、容器高度、标签位置和行距。
- [ ] 对齐文件夹预览卡、文件夹展开面板的尺寸、留白和栅格规则。
- [ ] 对齐左侧页面栏的真实宽度、图标尺寸、hover/active 状态和边缘唤出行为。
- [ ] 对齐顶部控制区图标顺序、尺寸、状态切换和简洁模式下的精确显隐规则。
- [ ] 对齐底部 Dock 的高度、圆角、分隔线、垃圾桶区域、模糊强度与拖拽反馈。

### B. 编辑模式与拖拽工作流

- [ ] 彻底移除“标准态显式编辑按钮进入编辑”的依赖，确保长按是主路径，顶部按钮只承担退出编辑。
- [ ] 对齐主网格拖拽排序命中区、落点判断、占位反馈和取消拖拽后的状态清理。
- [ ] 对齐 Dock 内拖拽排序、拖入垃圾桶删除、拖回主网格、从主网格拖入 Dock。
- [ ] 对齐文件夹内拖拽排序、拖回根层、移入其他页面、移入 Dock。
- [ ] 对齐动作卡、应用卡、普通卡在编辑态中的按钮位置、图标样式和显示条件。
- [ ] 修复并回归所有“看起来可拖，但实际拖不动”或“拖动后状态残留”的问题。

### C. 多页面能力

- [ ] 把当前“分组管理”彻底语义化为“页面管理”，包括标题、按钮、字段、提示文案和数据含义。
- [ ] 首页必须视为固定页面参与页面管理显示，不能只显示附加页面。
- [x] 常驻保留“新增页面 / 页面管理”入口，不再隐藏在编辑态内部。
- [ ] 对齐页面创建后的默认图标、默认排序、默认“添加标签”入口、默认激活页规则。
- [ ] 对齐页面切换行为、最近页面恢复逻辑、本地缓存和登录态恢复逻辑。
- [ ] 对齐页面删除后的回退页面选择规则。
- [ ] 对齐页面栏的移动端 / 窄屏行为。

### D. 设置中心 1:1

- [ ] 对齐设置中心的打开位置、关闭动画、层级关系和遮罩行为。
- [ ] 对齐左侧菜单项、分区命名、分区顺序、菜单高亮和图标/文案结构。
- [ ] 把旧版 `tab://setting` 里的布局、打开方式、主题外观、备案、打赏、关于等全部接回。
- [ ] 对齐“访客写本地、登录写服务端”的全部旧规则，不只覆盖当前已接字段。
- [ ] 对齐设置修改后的即时预览行为和保存后的恢复逻辑。
- [ ] 补齐页面管理入口在设置中心中的完整工作流。
- [ ] 对齐用户中心、个人控制台、登录态入口在设置中心或控制中心中的结构。

### E. 搜索体验 1:1

- [ ] 对齐标准模式搜索框左侧搜索引擎图标按钮行为。
- [ ] 对齐简洁模式下搜索引擎下拉宽度、字体、边框、阴影和命名。
- [ ] 对齐搜索框右侧按钮图标、对齐方式和 hover/active 状态。
- [ ] 对齐搜索面板的展开方式、层级、圆角、模糊和 section 顺序。
- [ ] 对齐搜索历史、推荐词、图标搜索结果的内容规则和显隐规则。
- [ ] 对齐 `SearchEngineLocal` 与其他搜索偏好缓存行为。

### F. 右键菜单 1:1

- [ ] 对齐桌面右键菜单 `deskMouseMenu` 的结构、布局切换按钮和刷新项。
- [ ] 对齐标签右键菜单 `mouseMenu` 的结构、子菜单展开方向和延迟。
- [ ] 对齐“编辑 / 删除 / 加入 Dock / 移动页面 / 打开入口”这些菜单项的完整行为。
- [ ] 对齐右键菜单出现位置、关闭时机和 hover 反馈。

### G. 特殊卡片与窗口容器

- [x] 对齐应用卡 `app = 1` 的窗口容器行为，不只保留角标。
- [ ] 对齐 `记事本 / WebTerm / 火山翻译` 等特殊卡片打开方式。
- [ ] 迁移窗口标题栏、最小化、全屏、拖拽、缩放和层级逻辑。
- [ ] 迁移插件容器和动态组件卡片能力。

### H. 账户与第三方登录

- [ ] 对齐用户菜单、个人控制台入口和登录态面板。
- [ ] 补齐 QQ / 微信登录在新版中的真实入口和状态轮询，不再提示“保留在兼容入口”。
- [ ] 对齐登录 / 注册 / 找回密码弹层的视觉、路径和状态反馈。

### I. 工程与架构

- [ ] 拆分首页主文件中过多的行为分支，把卡片展示、编辑工作流、搜索、页面管理继续拆模块。
- [ ] 清理首页中已失效的兼容入口死代码与临时分支。
- [ ] 建立“页面管理”与“卡片管理”的更清晰领域模型，避免继续复用旧的 `group` 语义。
- [ ] 为首页数据层、卡片模型层和设置持久化补单元测试。
- [ ] 补一份首页回归清单，覆盖长按编辑、拖拽、页面管理、设置中心、简洁模式和搜索。

## 当前正确执行顺序

### Phase 1：入口和结构先对

- [ ] 彻底收干净新版主路径里的兼容入口残留代码。
- [ ] 完成“页面管理”语义替换，让页面入口、弹层、设置中心一致。
- [ ] 完成设置中心的壳层和菜单 1:1。

### Phase 2：工作流必须闭环

- [ ] 补齐页面创建 / 删除 / 切换 / 默认页逻辑。
- [ ] 补齐主网格 / 文件夹 / Dock 三套拖拽链路。
- [ ] 补齐右键菜单。

### Phase 3：视觉细节压 1:1

- [ ] 压主网格尺寸、行距、文件夹卡和 Dock。
- [ ] 压顶部控制区、页面栏、搜索框和搜索面板。

### Phase 4：扩展能力回填

- [ ] 窗口容器、应用卡、插件卡。
- [ ] 第三方登录与账户控制台。

## 每轮必须检查

- [ ] 这轮是否仍以兼容模式为唯一基线。
- [ ] 这轮是否把“入口、结构、行为、视觉”中的至少一条主链路推进到了可验证状态。
- [ ] 这轮是否把新增方向和剩余方向写回 `maintain.md` 与 `plan.md`。
- [ ] `npm run typecheck` 是否通过。
- [ ] `npm run build` 是否通过。

---

## 后台管理改造计划（Phase 5：Admin Backend Redesign）

### 目标

为 Bendy 导航构建完整的后台管理系统，统一管理用户、书签、页面、卡片、壁纸、插件、审计日志。后台路径使用 `/admin`，独立于首页。后端沿用 Next.js route handlers，持久层采用 Prisma + SQLite（开发）/ MySQL（生产），配置全部走 `.env`。

### 边界

- 后台访问需登录 + RBAC（角色：`superadmin` / `admin` / `auditor`）。
- 敏感操作（删除用户、踢出会话、重置导航默认数据）需二次校验（TOTP 或邮件二次确认）。
- 所有接口遵守 `{code, message, data}` 响应格式；错误码集中在 `src/server/shared/error-codes.ts`。
- 所有业务资源均带业务前缀 `bendy_`（DB 表 / Redis key / 配置项）。

### 模块拆分

1. **Auth 子系统**
   - `/admin/login`，`/admin/totp/bind`，`/admin/totp/verify`
   - Token：短期 access (15min) + 长期 refresh (14d)，存储在 httpOnly cookie
   - 登录失败限流 (5次/15min) + 验证码兜底
   - TOTP 密钥使用 AES-GCM 加密，密钥来自 `.env:ADMIN_TOTP_MASTER_KEY`

2. **Dashboard**
   - 首屏概览：用户总数、当日新增、在线会话、最近 50 条审计日志、磁盘占用
   - 图表：近 30 天注册 / 登录 / 书签创建趋势（使用 `recharts`）

3. **用户管理**
   - 列表（分页、搜索、角色筛选）
   - 详情页（基础资料、书签数、会话、登录历史）
   - 操作：禁用/启用、踢人（吊销所有 refresh token）、重置密码、改角色、删除（软删）
   - 批量：导出 CSV、批量禁用

4. **书签/卡片/页面管理**
   - 全局视角查看任意用户的首页数据（只读默认，启用"维护模式"后可改）
   - 默认模板（defaultTab.json）在线编辑器（JSON schema 校验 + 预览）
   - 卡片插件目录维护

5. **壁纸库管理**
   - 上传 / 替换 / 删除 / 排序
   - 对接 S3 / 本地 FS（`.env:STORAGE_DRIVER`）

6. **审计日志**
   - 所有敏感操作写入 `bendy_audit_log`
   - 列表页可按用户、操作类型、时间范围筛选
   - 导出 JSON / CSV

7. **系统设置**
   - 站点基本信息、备案号、Logo、第三方登录开关（QQ/微信）
   - 备份与恢复：手动触发备份、列出快照、一键恢复
   - 维护模式开关（前台只读）

### 数据模型（Prisma schema 新增）

- `BendyAdminUser { id, email, passwordHash, totpSecret?, role, status, lastLoginAt }`
- `BendyAdminSession { id, userId, refreshTokenHash, userAgent, ip, revokedAt, expiresAt }`
- `BendyAdminAuditLog { id, actorId, action, targetType, targetId, payload(JSON), ip, createdAt }`
- `BendyWallpaper { id, url, category, order, uploadedBy, createdAt }`
- `BendyDefaultTemplate { id, version, content(JSON), publishedAt, publishedBy }`

### API 约定

- 全部放在 `app/api/admin/*`
- Middleware：`requireAdminAuth`, `requireRole`, `auditLog`
- 返回统一结构；错误码列表：1001 Token 过期 / 1002 权限不足 / 1003 二次校验失败 / 2001 资源不存在 / 2002 校验失败 / 5001 服务器错误

### 前端路由

- `/admin` — 登录态校验后跳 `/admin/dashboard`
- `/admin/login` - `/admin/totp`
- `/admin/dashboard` - `/admin/users` - `/admin/users/[id]`
- `/admin/content/templates` - `/admin/content/wallpapers` - `/admin/content/plugins`
- `/admin/audit` - `/admin/settings` - `/admin/backup`

### UI 规范

- 基于 shadcn-style 组件（已有的 Next.js CSS module 体系）
- 三栏布局：左侧菜单 280px + 顶部导航 56px + 内容区
- 色板延续首页主题（深色 + 品牌蓝）；表格、表单、按钮统一组件化

### 实施顺序（单次迭代内）

1. **基础设施**
   - 落地 Prisma + 迁移；生成 `schema.prisma`；添加 `prisma migrate dev` 到脚本
   - 写 seed：创建默认 `superadmin`（从 `.env` 读取初始账号）
   - 建立 `src/server/admin/**` 分层（application / domain / infra）
2. **Auth**
   - 登录、TOTP 绑定/校验、刷新、登出、吊销
   - 单元测试：TOTP 生成/验证、Token 签发/吊销、限流
3. **后台壳层**
   - 布局组件、左侧菜单、面包屑、全局 Toast
   - Middleware `requireAdminAuth`
4. **用户管理**（含审计写入）
5. **内容管理**（模板、壁纸、插件）
6. **审计日志 + 系统设置 + 备份**
7. **Dashboard 指标卡**

### 验收标准

- `npm run typecheck` / `npm run lint` / `npm run build` 全部通过
- Auth、TOTP、审计日志模块测试覆盖率 ≥ 80%
- `npm audit` 无高危漏洞
- Docker Compose 一键拉起（web + mysql + redis）
- README 与 maintain.md 记录所有新增 `.env` 配置项

- [ ] `npm run build` 是否通过。

---

## Phase 6：统一书签表 / 推荐中心 / 卡片规范（2026-04-20 批次）

### 已落地

- [x] 新增 `Bookmark` 模型（`bendy_bookmark`，36 列上限），支持浏览器扩展 JSON 导入与 Netscape `bookmarks.html` 直接解析。字段涵盖 URL、标题、文件夹路径、标签、页面元数据、AI 生成文案、抓取错误、图标、私有标记、来源批次、推荐元信息、软删除、排序、扩展 JSON。
- [x] `POST /api/bookmarks/import` 保留 `x-api-key` 模式供插件调用，同时兼容 session Cookie；可传 `bookmarks[]` 或原始 `html` 文本；自动解析 Netscape 格式；可选 `writeHomeTile` 附带写 `Link` 瓦片；兼容已有 legacy `link` JSONB 写入。
- [x] 后台新增「推荐中心」`/admin/content/recommendations`，支持筛选、勾选推荐、设置推荐标题 / 描述 / 排序、设置是否公开。
- [x] C 端 `/api/home/recommendations` 公共只读接口，供首页「添加标签 → 推荐标签」Tab 拉取（先读新表，空时降级读 legacy `/LinkStore/list`）。
- [x] `AddLinkDialog` 的「推荐标签 / 添加卡片」Tab 能力保持，已可被新接口复用。
- [x] C 端主题改为黑白灰，所有原 iOS 蓝（`#007aff`/`#1570ef`/`#0084ff`/`#164dae`/`#2e68ff`/`#4f9df7`/`#2764c5`/`#eef4ff`）统一替换为灰阶主色。
- [x] 修复「页面管理」弹窗：左栏项宽度不再超出边界；右侧页面图标网格统一放大为 44px 单元 + 图标 26px；操作按钮 wrap 回退时不再压到页面名称。

### 未落地（卡片规范技术方案）

> 范围：卡片由用户通过「卡片编辑器」制作 → 提交收录 → 后台审核通过 → 出现在所有人的「添加卡片」Tab。本节只出方案，本迭代不实现代码。

#### 卡片数据形态

卡片本质是"在首页瓦片区加载的小型 Web 应用"。规范主体字段如下（对齐现有 `/card/index` legacy 返回结构，便于两侧并行）：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `id` | cuid | 卡片主键 |
| `slug` | string | URL 友好唯一短名（例如 `weather-hub`） |
| `name` | string | 展示名 |
| `nameEn` | string? | 英文名 |
| `tips` | string | 一句话简介 |
| `description` | string | 详情（Markdown 允许） |
| `icon` | string | 图标 URL |
| `coverUrl` | string? | 预览封面 |
| `entryUrl` | string | 卡片页面可嵌入地址（iframe/new window 两种宿主） |
| `host` | enum `iframe` / `window` / `inline` | 运行宿主形态 |
| `size` | enum `1x1` `1x2` `2x2` `2x4` | 初始网格尺寸 |
| `resizable` | boolean | 是否允许用户在宿主里调整尺寸 |
| `permissions` | string[] | 请求的能力（`clipboard` `location` `storage` `network.example.com`） |
| `schemaVersion` | number | 规范版本号，向前兼容用 |
| `sandbox` | string | iframe `sandbox` 属性白名单（默认 `allow-scripts allow-forms`） |
| `contentSecurityPolicy` | string? | 声明自身 CSP，上架后 Proxy 层会校验 |
| `author` | `{ userId, displayName, contact }` | 提交者信息 |
| `version` | semver string | 卡片版本 |
| `changelog` | string? | 本版更新说明 |
| `status` | enum `draft` `submitted` `reviewing` `approved` `rejected` `deprecated` | 收录流程状态 |
| `rejectReason` | string? | 审核驳回理由 |
| `installNum` | number | 公共安装量 |
| `isFeatured` | boolean | 首页推荐位 |
| `tags` | string[] | 分类标签 |
| `createdAt` / `updatedAt` / `publishedAt` | DateTime | 时间戳 |

后续落地时新建 `BendyCard` 与 `BendyCardSubmission` 两张表：`BendyCard` 只保存当前上架版本，`BendyCardSubmission` 保留全部历史版本与审核动作。

#### 卡片编辑器规范

提供给用户的「卡片编辑器」不是完整代码编辑器，而是表单 + HTML/JS 片段面板的集合：

1. **基础信息表单**：name / slug / tips / description / 图标上传 / 封面上传 / 尺寸预设 / 分类标签。
2. **运行宿主选择**：
   - `iframe`：用户只提交 `entryUrl`，必须是 HTTPS，必须返回 `X-Frame-Options: SAMEORIGIN` 或省略该头，CSP 合规。
   - `inline`：用户直接粘贴 HTML/JS（上限 64KB），发布时由系统打包为独立 HTML 文件托管在 `/cards/<slug>/<version>/index.html`。
   - `window`：与 `iframe` 一致，但首页以弹出式窗口容器打开，适合工具型应用。
3. **能力声明面板**：勾选 `permissions`、`sandbox` 白名单、是否需要用户登录态 token。未勾选的能力在运行时由宿主 Proxy 拦截。
4. **实时预览**：编辑器右侧以当前首页尺寸（1x1 / 2x2 / 2x4）预览卡片渲染效果。
5. **提交入口**：表单通过 `POST /api/cards/submissions` 生成 `BendyCardSubmission` 记录，状态置为 `submitted`，进入审核队列。

#### 审核流程

1. 用户提交 → 后台「推荐中心 / 卡片审核」列表新增一条。
2. 管理员在后台预览（iframe/inline 在隔离域下加载，window 直接在新标签验证），检查：
   - 是否包含恶意脚本（自动化：`serialize-javascript` + 静态扫描常见危险模式 `eval`/`Function("` 等）。
   - CSP 是否合规。
   - 权限声明是否真实必要。
   - 文案是否合规（广告 / 违法内容）。
3. 审核动作：`approved` / `rejected(原因)` / `request-changes(提示)`。
4. `approved` 后：
   - 生成公共版本号（semver bump rule：首次 `1.0.0`）。
   - `BendyCard.status = approved`，`publishedAt = now`。
   - 自动同步到公共目录 `/api/cards/public` 与首页「添加卡片」Tab。
5. `rejected` / `request-changes` 后用户可修改再提交（新 `BendyCardSubmission` 记录，不覆盖历史）。

#### 安全与运行时约束

- 所有 iframe 宿主强制 `sandbox="allow-scripts allow-forms allow-popups allow-same-origin"`（后两项按卡片声明开关）。
- inline 宿主打包后的 HTML 统一注入 CSP：`default-src 'self'; script-src 'self' 'unsafe-inline'; img-src * data:; style-src 'self' 'unsafe-inline'`。
- `network` 权限通过服务端代理转发，禁止直接跨域访问未声明的 Host。
- 卡片内无法读取宿主 localStorage；只能通过 `postMessage` 与宿主通信，宿主仅暴露白名单 API（`getSession` `readSetting` `writeSetting` 限定 key）。
- 日志：所有 `approve` / `reject` / `deprecate` 动作写入 `bendy_audit_log`。

#### 对接 C 端

- C 端「添加卡片」Tab 改读 `GET /api/cards/public`，按 `installNum` 与 `isFeatured` 排序。
- 安装即写入 `Link.meta.cardId` 并记录安装事件（匿名 installNum +1）。
- 卸载即解绑，不减 installNum（简化统计）。

#### 实施顺序（后续迭代）

1. Prisma schema 新增 `BendyCard` + `BendyCardSubmission`。
2. `/api/cards/submissions`（POST 创建）、`/api/cards/submissions/[id]`（GET 详情 / PATCH 更新状态）。
3. 后台「卡片审核」页（沿用推荐中心的框架）。
4. 「卡片编辑器」前端页面（基于现有 AddLinkDialog 抽出的通用表单组件）。
5. 卡片打包服务（inline 模式的 HTML 组装与托管）。
6. 静态安全扫描（serialize / CSP 校验）。
7. C 端「添加卡片」Tab 切换数据源。
8. 分版本迁移 legacy `/card/index` 数据到 `BendyCard`。
