
     当前 feat/admin-foundation 分支完成到 F8 + 一次 refactor。用户一次性提出 9 项需求,需在验收后推远程。需求涉及:GitHub
     头像落地、用户资料编辑、首页布局/组件微调、默认内容清空、书签批量导入接口、更新文档。

     现状速查(关键路径)

     - 首页渲染入口: app/page.tsx — session 构造的 HomeUser 把 avatar 硬编码为 /brand/logo-192.png(行 25、39),丢弃了 OAuth 回调写入 DB 的 user.avatarUrl。
     - OAuth 回调: app/api/auth/github/callback/route.ts — 已把 GitHub 返回的 avatarUrl/name upsert 到 User 表(行 86-105),无需改动。
     - Session JWT 结构: src/server/auth/session.ts SessionClaims 只含 sub/role/login/email/jti/typ — 不含 avatar/name,故 /api/auth/me 目前也不返回头像。
     - Prisma User: prisma/schema.prisma 行 29-56 — 已有 avatarUrl String? 和 name String? 字段,邮箱是 @unique。
     - 首页数据源: src/server/home/home-data.ts 仍走 legacy SQL(link/tabbar/config 表 JSON 列),不经 Prisma。
     - 首页主组件: src/features/home/home-page.tsx(4140 行)
       - Toolbar 位置: 行 718-803(登录后这里挂 UserMenu/设置/简洁模式按钮)
       - 搜索栏: 行 836-1187,compactMode 用下拉弹窗(行 1123-1151),标准模式用点击循环(行 1156-1183)
       - Sidebar: 行 589-716,包含 UserMenu + 页面组 + 设置按钮
       - 插件卡片渲染: 行 3782-3797 (isPluginCard(item) → <ComponentTile>)
     - Settings 面板: src/features/home/home-settings.tsx
       - "个人中心位置" 行 502-530(当前 left/right)
       - "侧栏位置" 行 473-500(right/bottom)
       - UserCard(行 287-301)当前显示 site.title 首字,不用 user 头像
       - sideClassName 行 242-248 用 controlModelLeft/controlModelRight
     - CSS: src/features/home/home-page.module.css 行 2880-2909 controlModel/Left/Right,行 3684-3699 移动端覆盖
     - types.ts: userCenterPosition: string 行 63、pageGroupPosition: "right"|"bottom" 行 65
     - 默认配置 resolver: src/server/home/home-data.ts 行 515(userCenterPosition 默认 "left")、行 518(pageGroupPosition 默认 "right")
     - 默认标签 JSON: public/static/defaultTab.json(762 行,大量 icon 类型 link + tabbar)
     - 插件: plugins/calendar、plugins/weather、plugins/topSearch 都已就绪(info.json + card URL)
     - 管理端用户列表: app/admin/users/page.tsx(只展示/筛选,无编辑);详情 app/admin/users/[id]/page.tsx;操作 user-actions.tsx(只有 role/status/删除/吊销会话)
     - 管理端用户 API: app/api/admin/users/[id]/route.ts PATCH 只接受 role/status;src/server/admin/users/service.ts updateUser 也只接这两个字段
     - 审计: src/server/admin/audit/writer.ts writeAudit({ actorId, action, targetType, targetId, payload, ip })
     - 更新文档: maintain.md 按 ## v2.4.XX 倒序追加(当前 2.4.39);package.json version 已是 2.4.40 但 maintain.md 未加

     实施方案

     需求 #1 + #8 — GitHub 头像落地 & 用户资料编辑

     改动文件
     - app/page.tsx:用 prisma.user.findUnique({where:{id:session.sub}, select:{avatarUrl:true,name:true,id:true}}) 替换硬编码 avatar。fallback 保留 /brand/logo-192.png。nickname 取 user.name ??      
     session.login。
     - src/server/home/types.ts HomeUser:保留现有字段(userId 改 string 兼容 Prisma cuid)。
     - app/api/auth/me/route.ts:加一次 Prisma 查询,返回 avatarUrl/name。
     - 新增 app/api/me/route.ts:PATCH 接口,已登录用户只能修改 name(昵称)和 avatarUrl(URL 字符串)。不接受 email 字段(用户确认)。校验字符串长度,写审计 user.profile.update。
     - 新增 src/features/home/home-profile-dialog.tsx:小弹窗,UserMenu 里"修改资料"按钮打开,两个输入框(昵称/头像 URL)+ 保存。
     - src/features/home/home-auth.tsx UserMenu:在"进入管理后台/退出登录"之间插入"修改资料"按钮。
     - src/server/admin/users/service.ts updateUser:拓展 patch 类型,新增 name?/avatarUrl?/email?;email 唯一性冲突返 CONFLICT。
     - app/api/admin/users/[id]/route.ts PATCH:接受 name/avatarUrl/email(管理端可改邮箱)。action 名:user.profile.update。email 变更不强制 reauth(与 role 变更不同)。
     - app/admin/users/[id]/page.tsx + user-actions.tsx:加一个"编辑资料"区(昵称/头像 URL/邮箱三输入框 + 保存按钮)。
     - 用户 ID 恒不可改(path 参数即是)。

     新增枚举 src/server/admin/audit/writer.ts:在 AuditAction 加 "user.profile.update"。

     需求 #2 + #3 — 个人中心位置(左→中)& 登录后内部布局

     - src/server/home/home-data.ts 行 515:userCenterPosition 默认从 "left" 改 "center",解析时把未知值(含老数据的 "left")规整为 "center"。
     - src/features/home/home-settings.tsx 行 507-517:把"左侧/left"按钮改成"居中/center"。sideClassName(行 242-248)按 center/right 选 controlModelCenter/controlModelRight。
     - src/features/home/home-page.module.css:新增
     .controlModelCenter { left:50%; transform:translateX(-50%); transform-origin:center bottom; animation:settingsPanelCenterIn 220ms ease forwards; }
     @keyframes settingsPanelCenterIn { from{ opacity:0; transform:translate(-50%, 24px);} to{ opacity:1; transform:translate(-50%, 0);} }
     @media (max-width:700px){ .controlModelCenter{ left:0; transform:none; animation:settingsPanelMobileCenterIn 220ms ease forwards;} }
     - 保留 .controlModelLeft 以兼容旧数据(默认值不再指向它但不误伤存量配置)。
     - src/features/home/home-settings.tsx 行 287-301 UserCard:登录态改版
     ┌──────────────────────────┐
     │ [avatar]       笨迪导航  │
     │        {nickname}         │
     └──────────────────────────┘
       - 未登录时维持现状
       - 新 props:user: HomeUser | null,从 HomePage 透传进来(目前 home-settings 只拿到 loggedIn:boolean,需顺带把 user 对象透下来)
       - 样式新增 .controlUserCardHead(横向排)、.controlUserCardNickname(下方居中)

     需求 #4 — 侧栏默认位置改底部

     - src/server/home/home-data.ts 行 518:pageGroupPosition 默认从 "right" 改 "bottom"。
     - 设置里的 right/bottom 两个按钮保留不动。

     需求 #5 — 清空默认卡片和书签 + 保留 3 个默认插件卡

     public/static/defaultTab.json 改写为:

     {
       "link": [
         { id:"default-calendar", app:1, type:"component", component:"plugins",
           name:"日历", url:"/plugins/calendar/card", src:"/plugins/calendar/static/ico.png",
           size:"2x4", sort:0, origin_id:1001,
           custom:{ name_en:"calendar", window:"/plugins/calendar/window", version:1 }, pageGroup:"", pid:null },
         { id:"default-weather", app:1, type:"component", component:"plugins",
           name:"天气", url:"/plugins/weather/card", src:"/plugins/weather/static/ico.png",
           size:"2x4", sort:1, origin_id:1002,
           custom:{ name_en:"weather", window:"/plugins/weather/window", version:1 }, pageGroup:"", pid:null },
         { id:"default-topsearch", app:1, type:"component", component:"plugins",
           name:"热搜", url:"/plugins/topSearch/card", src:"/plugins/topSearch/static/ico.png",
           size:"2x4", sort:2, origin_id:1003,
           custom:{ name_en:"topSearch", window:"/plugins/topSearch/window", version:1 }, pageGroup:"", pid:null }
       ],
       "tabbar": [],
       "config": {}
     }

     ▎ 说明:新用户会看到空 Dock + 只有 3 张插件卡 + 无书签图标。tabbar 也清空(用户确认)。已存在旧用户的个人 link/tabbar/config 不动(home-data 里个人状态 override 默认)。

     推库命令:默认 JSON 不涉及库迁移。但新 Prisma action 字段无 enum 约束,不需迁移。若用户想让改动生效仅需 npm run dev;若需要重新生成 Prisma Client(因为 admin service.ts 类型变化),执行 npm run       
     prisma:generate 即可。如果需要让"改邮箱"之类的写入真正生效,已有 DB 中现有 schema 就够用,不需要 migrate。

     需求 #6 — 搜索引擎选择器改下拉弹窗

     src/features/home/home-page.tsx 行 1154-1186(标准模式):
     - 把按钮 onClick 从"循环下一个"改成 setPanelOpen(o=>!o),与 compact 模式一致。
     - 搜索面板里(searchPanelContent 内部,行 1031 起)已有引擎列表区;把 compact 模式独占的下拉选择 UI 抽出来在标准模式下也显示。
     - 标准模式按钮样式:保留图标+名字,末尾加 ▾ caret(复用 .searchEngineCompactCaret 或加 .searchEngineCaret 通用类)。
     - 点击外部仍调 handlePointerDown 关闭(行 932-947)。

     需求 #7 — 登录后顶栏精简

     src/features/home/home-page.tsx Toolbar 组件(行 718-803):
     - 当 user 存在:只渲染简洁模式切换按钮 + 编辑中的退出编辑按钮;不渲染 accountButton 和 onOpenSettings 按钮。
     - 当 user 不存在:保留现状(登录按钮 + 设置 + 简洁模式)。
     - 实现:const loggedIn = !!user; 然后按 loggedIn 条件渲染。

     需求 #8 — 书签批量导入接口

     新文件:app/api/bookmarks/import/route.ts
     - POST,API Key 鉴权:header x-api-key 必须等于新 env BOOKMARK_IMPORT_API_KEY(启动时若未配置则接口返 FORBIDDEN)。同时 body 必须带 userId(目标用户 cuid),接口据此落库。
       - 理由:用户选了 "API Key + 双写",外部工具(浏览器扩展/爬虫)不依赖登录 cookie。
     - 请求体:
     {
       userId: "<cuid>",
       bookmarks: Array<{bookmark_id, url, bookmark_title, folder_path, date_added, page_title, page_description, page_text, generated_title, generated_description, crawl_error, tags}>
     }
     - bookmarks 单条也是 array。
     - 校验:userId 必须存在(Prisma 查);空数组返 VALIDATION;每条必须有 url;超过 1000 条返 VALIDATION。
     - 双写:
       a. Prisma Link(写入 bendy_link):userId=body.userId;name = bookmark_title || generated_title || page_title || url;url;meta 塞原始 {folder_path, tags, page_description, generated_description,   
     date_added, bookmark_id};sort 从现有 max+1 起。
       b. Legacy link JSON 列(legacy link 表 user_id = 数字):legacy user_id 是 int 而 Prisma User.id 是 cuid — 需要映射。查 legacy user 表按 email 匹配到 int id(GitHub OAuth 已写 email 到
     Prisma,legacy user 表可能没有同一条)。
           - 若 legacy 表没这个用户:跳过 legacy 写,只写 Prisma;响应 payload 加 legacyWritten: false 说明原因。
         - 若有:读 JSON、append mapped HomeLink、写回。
     - 响应:{ code:0, data:{ imported: N, skipped: M, legacyWritten: boolean }}。
     - 审计:action:"bookmark.import",actorId:null,targetType:"user",targetId:body.userId,payload:{count:N, source:"api-key"}。
     - 新 AuditAction 加 "bookmark.import"。
     - 新 env:BOOKMARK_IMPORT_API_KEY(追加到 .env.example)。

     辅助模块 src/server/bookmarks/import-service.ts:纯函数 mapBookmarkToHomeLink / mapBookmarkToPrismaLink,便于单测(tests/ 已有 vitest)。

     需求 #9 — 更新文档

     - maintain.md 顶部 Discussion Record 下插入新节 ## v2.4.40,列出本次 9 项需求落地。
     - package.json 已是 2.4.40 无需改。
     - README.md 不改(本轮无面向用户的配置变化)。

     执行顺序

     1. Schema/类型面:types.ts HomeUser、audit writer action、admin service updateUser 签名。
     2. 后端 API:/api/me PATCH、admin users PATCH 扩展、/api/bookmarks/import。
     3. SSR 数据:app/page.tsx 读 Prisma、/api/auth/me 返头像。
     4. 默认值:home-data.ts 两个默认 + defaultTab.json 重写。
     5. 前端 UI:home-page.tsx(Toolbar 精简 + 搜索引擎下拉);home-settings.tsx(UserCard 布局 + 个人中心位置按钮);home-profile-dialog.tsx(新);home-auth.tsx(UserMenu 菜单项);admin users 详情编辑区。     
     6. CSS:新增 .controlModelCenter + 响应式、.controlUserCardHead。
     7. maintain.md 追加 v2.4.40。
     8. npm run typecheck + 如需 npm run prisma:generate。

     验证

     - npm run typecheck 通过。
     - npm run dev 起站,未登录态:首页三张默认卡(日历/天气/热搜)、零书签、空 Dock、侧栏默认在底部、个人中心位置默认居中。
     - 走一次 GitHub 登录,确认:
       - 侧栏 UserMenu 头像是 GitHub 头像(而非 BD logo)。
       - Toolbar 只剩简洁模式按钮。
       - 设置面板打开默认居中,UserCard 显示"avatar | 笨迪导航 / 昵称"。
       - 设置里"个人中心位置"两个按钮"居中/右侧"工作正常,存量 "left" 值被规整成居中。
     - UserMenu 点"修改资料"→ 改昵称/头像 URL → 保存 → 刷新生效。
     - /admin/users/{id} 编辑区改昵称/头像/邮箱 → 保存 → 列表可见新值;邮箱重复返 CONFLICT。
     - 搜索框左侧点击引擎按钮 → 弹出下拉,与 compact 模式行为一致。
     - curl -X POST /api/bookmarks/import -H 'cookie: bendy_session=…' -d '[<example.json>]' → 返 {imported:1};首页看到新增书签;admin /users/{id} 的"书签数"+1。
     - 重新导入单条 + 重新导入 500 条两组都 ok。

● 我开始实施。先看 HomeUser.userId 怎么用再决定类型。

  Searched for 2 patterns (ctrl+o to expand)

● 先做类型/审计枚举/admin service 签名扩展。