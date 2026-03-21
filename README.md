# bendy-nav-nextjs

基于 Next.js + TypeScript 的重构版本，目标是保持原有功能与接口兼容，同时实现严格分包与工程化分层。

## 分层结构

- `app/`: Next.js 路由入口（仅路由绑定，不放业务）
- `src/server/admin`: 后台侧分包（admin scope）
- `src/server/client`: C 端分包（client scope）
- `src/server/router`: 路由分发与作用域识别
- `src/server/legacy`: 兼容层（承接老功能，确保行为一致）
- `src/server/infrastructure`: 配置、缓存、数据库等基础设施
- `src/lib`: 历史别名兼容导出
- `public/`, `plugins/`, `resources/`: 原项目静态资源与插件

## 快速开始

```bash
npm install
npm run db:init
npm run dev
```

默认访问 `http://127.0.0.1:3000`。

## 构建运行

```bash
npm run build
npm run start
```

## 说明

- 旧接口路径保持兼容（根路由 + catch-all 统一接入）。
- 在代码层面先完成 admin/client 严格分包，再通过兼容层桥接原业务。
- SQL 与插件资源延续原项目文件，保证迁移成本最低。
