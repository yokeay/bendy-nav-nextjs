# bendy-nav-nextjs

<p align="center">
  <img src="public/brand/logo-192.png" alt="bendy-nav-nextjs logo" width="96" height="96" />
</p>

基于 [mtab](https://github.com/tsxcw/mtab) 的 Next.js 重写版本，目标是在保留原有路由形态、静态资源组织和业务兼容层的前提下，把项目迁移到更现代的 TypeScript / React / Next.js 工程体系中。

## Language / 语言

- 中文（默认）
- English
- Español
- Монгол
- ئۇيغۇرچە
- བོད་ཡིག
- العربية
- Français

## 中文

### 项目来源

`bendy-nav-nextjs` 不是对原项目的简单壳层包装，而是一个以 **Next.js 15 + React 19 + TypeScript** 为核心的新工程。

- 原始参考项目：[`tsxcw/mtab`](https://github.com/tsxcw/mtab)
- 当前项目定位：在 Node.js / Next.js 运行时中重建 `mtab` 的主要能力，并保留 legacy 兼容入口，便于逐步迁移。
- 当前实现方式：`app/` 负责 Next.js 路由接入，`src/server/legacy` 负责兼容原接口语义，`public/`、`plugins/`、`resources/` 延续原项目的静态资产与插件资源组织。

### 技术架构区别

根据原仓库公开目录和 `composer.json` 可以判断，原始 `mtab` 是一套以 **PHP / ThinkPHP 风格单体应用** 为核心的实现；当前仓库则是面向 Node.js 的 Next.js 重写。

| 维度 | 原始 mtab | 当前 bendy-nav-nextjs |
| --- | --- | --- |
| 核心运行时 | PHP 单体应用 | Node.js + Next.js Route Handlers |
| Web 框架组织 | 传统服务端目录、静态资源目录、PHP 配置文件 | `app/` 路由入口 + `src/` 业务分层 + TypeScript 类型约束 |
| 路由接入 | 原项目路由体系 | `app/page.tsx` 接管新版首页，`app/[...path]/route.ts` 继续转发 legacy dispatcher |
| 前端工程 | 原项目历史前端资源与页面模板 | Next.js 工程承接，同时兼容 `public/dist`、`app/view` 等旧资源 |
| 配置方式 | 仓库内配置文件思路 | 以 `.env` / `.env.local` 为标准，旧 `app.config.json` 仅保留兼容兜底 |
| 数据访问 | 原项目服务端数据访问方式 | `postgres` Node 客户端 + TypeScript 配置读取 |
| 部署目标 | 更偏传统服务器 / 容器自托管 | 可部署到 Node 环境，也可接入 Vercel，但需注意文件写入限制 |
| 演进方式 | 功能集中在原单体中 | 通过 `legacy` 兼容层逐步拆分与重构 |

### 目录总览

- `app/`: Next.js 路由入口、首页页面与元数据文件。
- `src/features/home`: 新首页的 TypeScript 组件与样式实现。
- `src/server/legacy`: legacy 行为兼容层，承接原项目的接口与页面逻辑。
- `src/server/infrastructure`: 配置、数据库、缓存等基础设施。
- `src/lib`: 兼容导出层。
- `scripts/`: 开发、启动、数据库初始化、运行时辅助脚本。
- `plugins/`: 本地插件资源目录。
- `public/`: 静态资源、旧版前端产物、默认图片资源。
- `docs/`: 协议、服务条款与说明文档。

### 配置规范

仓库已切换为 `.env` 规范。

- 推荐做法：复制 `.env.example` 为 `.env`，然后填写真实值。
- 已废弃做法：把数据库、SMTP、管理员密码直接写进 `app.config.json`。
- 兼容策略：代码仍会尝试读取旧 `app.config.json`，但仅作为过渡兜底，不建议继续使用。

#### `.env` 变量说明

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | 否 | 应用端口，默认 `3000` / Application port, defaults to `3000` |
| `DATABASE_URL` | 是 | PostgreSQL 连接串 / PostgreSQL connection string |
| `SMTP_EMAIL` | 否 | 发信邮箱地址 / SMTP sender address |
| `SMTP_HOST` | 否 | SMTP 主机 / SMTP host |
| `SMTP_PORT` | 否 | SMTP 端口，默认 `465` / SMTP port, defaults to `465` |
| `SMTP_PASSWORD` | 否 | SMTP 密码 / SMTP password |
| `SMTP_SSL` | 否 | `1` 或 `true` 表示启用 SSL / Enables SSL when set to `1` or `true` |
| `SMTP_CODE_TEMPLATE` | 否 | 邮件验证码模板 / Mail verification template |
| `ADMIN_EMAIL` | 否 | 初始化管理员邮箱 / Bootstrap admin email |
| `ADMIN_PASSWORD` | 否 | 初始化管理员密码 / Bootstrap admin password |
| `AUTH_CODE` | 否 | 外部认证接入码 / Optional external auth code |
| `DEMO_MODE` | 否 | `true` 时启用演示模式 / Enables demo mode when `true` |

### 本地开发

1. 安装依赖：`npm install`
2. 复制模板：`cp .env.example .env` 或手动创建 `.env`
3. 配置数据库：填写 `DATABASE_URL`
4. 初始化数据库：`npm run db:init`
5. 启动开发环境：`npm run dev`
6. 生产构建：`npm run build`
7. 本地生产启动：`npm run start`

默认访问地址为 `http://127.0.0.1:3000`。

### Vercel 部署说明

Vercel 可以部署当前项目，但必须先理解它的边界。

#### 可以直接工作的部分

- Next.js 路由与 Node.js 服务端逻辑
- PostgreSQL 连接
- 常规页面访问、接口访问、只读静态资源分发
- 通过环境变量注入配置

#### 需要重点注意的限制

当前仓库仍保留多处 **本地文件写入行为**，例如：

- `runtime/` 目录临时文件
- `public/static/exportsTabLink.json`
- `public/browserExt.zip`
- 运行时上传与导出文件
- 动态插件下载、解压和写入 `plugins/`

这些行为在传统服务器上没有问题，但在 **Vercel 的无状态 / 临时文件系统** 中会遇到以下问题：

- 写入内容不会长期持久化
- 多实例之间不会共享本地文件
- 部署后生成的文件可能在下一次冷启动或重新部署时消失

#### 什么时候适合部署到 Vercel

- 你把项目当作预览环境、演示环境或轻量只读环境
- 你已经把上传、导出、插件安装等写文件流程迁移到对象存储、数据库或外部持久化服务
- 你接受某些 legacy 文件写入功能在 Vercel 上需要二次改造

#### 推荐的 Vercel 部署步骤

1. 准备一个外部 PostgreSQL 数据库，例如 Neon、Supabase、RDS 或自建 Postgres。
2. 在本地确认 `.env` 已能正常启动项目。
3. 将仓库导入 Vercel，新建 Project。
4. 在 Vercel Project Settings -> Environment Variables 中配置与 `.env` 相同的变量。
5. 确认 `DATABASE_URL`、`ADMIN_EMAIL`、`ADMIN_PASSWORD` 等关键变量已填写。
6. 构建命令使用 `npm run build`。
7. 安装命令使用默认 `npm install` 即可。
8. 输出类型保持 Next.js 默认检测，不需要额外指定静态导出目录。
9. 首次部署后，确认数据库表结构已初始化；如未初始化，请在可访问数据库的环境中执行 `npm run db:init`。
10. 如果你要在生产环境保留文件上传、插件安装、浏览器扩展打包等能力，请先把这些能力迁移出本地文件系统。

#### Vercel 生产建议

- 最稳妥方案：把当前项目视为“Next.js 服务层 + 外部 Postgres + 外部对象存储”架构。
- 不建议直接依赖 Vercel 本地文件系统保存用户上传、插件安装包或导出文件。
- 若要长期稳定运营，建议继续做两步重构：
  - 第一步：把 `runtime/` 和 `public/` 写入迁移到对象存储。
  - 第二步：把插件安装与扩展打包流程拆成后台任务或独立服务。

### 兼容性说明

本项目当前的重写策略不是“一次性彻底替换”，而是“通过 Next.js 承接入口，通过 legacy 层保证行为兼容”。因此你会在仓库中同时看到：

- 新的 Next.js / TypeScript 工程结构
- 保留下来的旧资源目录与 HTML 模板
- 面向迁移的路由分发与兼容实现

这也是为什么它既适合继续重构，也适合作为从原始 `mtab` 迁移到现代栈的中间层。

### 文档与协议

- 服务条款 / Terms: [docs/SERVICE_TERMS.html](docs/SERVICE_TERMS.html)
- 配置模板: [.env.example](.env.example)
- 原始参考项目: [mtab](https://github.com/tsxcw/mtab)

### 许可证说明

- 原始参考项目 `mtab` 使用 `MIT License`。
- 当前仓库中的衍生实现应继续保留原项目所要求的版权与许可信息。
- 本项目与原始 `mtab` 官方仓库之间不存在官方背书或从属关系。

<details>
<summary>English</summary>

## English

### Overview

`bendy-nav-nextjs` is a **Next.js 15 + React 19 + TypeScript** rewrite inspired by the original [mtab](https://github.com/tsxcw/mtab) project. The goal is to preserve legacy behavior while moving the runtime to a modern Node.js stack.

### Key differences

- Original `mtab`: inferred from the upstream repository structure and `composer.json` to be a PHP / ThinkPHP-style monolith.
- This repo: Next.js route handlers, TypeScript modules, Node.js PostgreSQL client, and a legacy compatibility layer.
- Configuration is now standardized around `.env` and `.env.local`; `app.config.json` is deprecated.

### Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Fill in `DATABASE_URL`.
4. Run `npm run db:init`.
5. Start development with `npm run dev`.

### Vercel notes

Vercel works for read-heavy or preview deployments, but this project still writes to local paths such as `runtime/`, `public/`, generated export files, and plugin folders. Those writes are ephemeral on Vercel, so production use should move them to object storage or another persistent service.

### Docs

- Terms: [docs/SERVICE_TERMS.html](docs/SERVICE_TERMS.html)
- Env template: [.env.example](.env.example)
- Upstream project: [mtab](https://github.com/tsxcw/mtab)

</details>

<details>
<summary>Español</summary>

## Español

### Resumen

`bendy-nav-nextjs` es una reescritura en **Next.js 15 + React 19 + TypeScript** basada en [mtab](https://github.com/tsxcw/mtab). La meta es mantener la compatibilidad heredada y llevar el proyecto a un stack moderno de Node.js.

### Diferencias principales

- `mtab` original: por la estructura pública del repositorio y `composer.json`, se puede inferir una arquitectura monolítica de estilo PHP / ThinkPHP.
- Este proyecto: Route Handlers de Next.js, tipado en TypeScript, cliente PostgreSQL para Node.js y una capa `legacy` para compatibilidad.
- La configuración pasa a `.env`; `app.config.json` queda obsoleto.

### Inicio local

1. Instala dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. Completa `DATABASE_URL`.
4. Ejecuta `npm run db:init`.
5. Inicia con `npm run dev`.

### Despliegue en Vercel

Vercel es válido para demos, previews o cargas principalmente de lectura. Sin embargo, el proyecto todavía escribe archivos en `runtime/`, `public/`, exportaciones y carpetas de plugins. En Vercel esos archivos no son persistentes, así que en producción conviene moverlos a almacenamiento externo.

</details>

<details>
<summary>Монгол</summary>

## Монгол

### Тойм

`bendy-nav-nextjs` нь [mtab](https://github.com/tsxcw/mtab) төслөөс санаа авч, **Next.js 15 + React 19 + TypeScript** дээр дахин бичсэн хувилбар юм. Зорилго нь хуучин үйлдлийг хадгалж, орчин үеийн Node.js инженерчлэл рүү шилжүүлэх явдал юм.

### Гол ялгаа

- Эх `mtab`: нээлттэй репозиторийн бүтэц болон `composer.json`-оос харахад PHP / ThinkPHP төрлийн монолит бүтэцтэй.
- Одоогийн төсөл: Next.js Route Handlers, TypeScript, PostgreSQL Node клиент, мөн `legacy` нийцлийн давхарга ашиглана.
- Тохиргоо нь одоо `.env` стандарт руу шилжсэн; `app.config.json` хуучирсан.

### Дотоод орчинд ажиллуулах

1. `npm install`
2. `.env.example` файлыг `.env` болгон хуулна.
3. `DATABASE_URL`-ээ бөглөнө.
4. `npm run db:init`
5. `npm run dev`

### Vercel

Vercel дээр унших төвтэй preview болон demo байршуулалт хийхэд тохиромжтой. Гэхдээ төсөл `runtime/`, `public/`, экспортын файл, plugin хавтас руу бичдэг тул байнгын хадгалалт хэрэгтэй бол гадаад storage ашиглах шаардлагатай.

</details>

<details>
<summary>ئۇيغۇرچە</summary>

## ئۇيغۇرچە

### قىسقىچە چۈشەندۈرۈش

`bendy-nav-nextjs` بولسا [mtab](https://github.com/tsxcw/mtab) نى ئاساس قىلغان، **Next.js 15 + React 19 + TypeScript** ئارقىلىق قايتا يېزىلغان نەشرىدۇر. مەقسەت legacy خۇسۇسىيەتلەرنى ساقلاپ قېلىش ۋە لايىھىنى زامانىۋى Node.js قۇرۇلمىسىغا كۆچۈرۈش.

### ئاساسىي پەرق

- ئەسلى `mtab`: ئاشكارا repo قۇرۇلمىسى ۋە `composer.json` غا قارىغاندا PHP / ThinkPHP ئۇسلۇبىدىكى monolith.
- نۆۋەتتىكى repo: Next.js route handler، TypeScript، PostgreSQL Node client ۋە legacy ماسلىشىش قەۋىتى.
- سەپلىمە `.env` ئۆلچىمىگە ئۆتتى؛ `app.config.json` ئەمدى تەۋسىيە قىلىنمايدۇ.

### يەرلىك قوزغىتىش

1. `npm install`
2. `.env.example` نى `.env` غا كۆچۈرۈڭ.
3. `DATABASE_URL` نى تولدۇرۇڭ.
4. `npm run db:init`
5. `npm run dev`

### Vercel ھەققىدە

Vercel preview ياكى demo ئۈچۈن ماس كېلىدۇ. بىراق بۇ لايىھە `runtime/`, `public/`, export ھۆججەتلىرى ۋە plugin قىسقۇچلىرىغا يېزىدۇ. بۇ خىل يېزىش Vercel دا ۋاقىتلىق بولىدۇ، شۇڭا ھەقىقىي ئىشلەپچىقىرىش مۇھىتىدا سىرتقى ساقلاش مۇلازىمىتى ئىشلىتىش كېرەك.

</details>

<details>
<summary>བོད་ཡིག</summary>

## བོད་ཡིག

### སྤྱི་བསྡུས།

`bendy-nav-nextjs` ནི [mtab](https://github.com/tsxcw/mtab) ལས་བརྟེན་པའི **Next.js 15 + React 19 + TypeScript** སྒྱུར་བཅོས་གསར་པ་ཞིག་ཡིན། legacy སྤྱོད་ཚུལ་ཉར་ཞིང་ Node.js བཟོ་བཀོད་གསར་པར་སྤོ་བ་དེ་དགོས་དོན་ཡིན།

### གནད་དོན་གཙོ་བོ།

- སྔོན་གྱི `mtab` ནི repo གཞི་ཁྱོན་དང `composer.json` ལས PHP / ThinkPHP ལྟ་བུའི monolith ཡིན་པ་བསྟན།
- ད་ལྟའི repo ནི Next.js route handler, TypeScript, PostgreSQL Node client དང legacy མཐུན་སྒྲིག་བརྒྱུད་རིམ་ཡོད།
- སྒྲིག་འགོད་ནི `.env` ཚད་གཞིར་སྒྱུར་ཟིན་པས `app.config.json` མུ་མཐུད་མི་བེད།

### ཡུལ་གནས་སྒྲིག་འགོད།

1. `npm install`
2. `.env.example` ནས `.env` དུ་བསྒྱུར།
3. `DATABASE_URL` བསྐོངས།
4. `npm run db:init`
5. `npm run dev`

### Vercel

Vercel ནི preview དང demo ལ་འཚམས། ཡིན་ནའང་ལས་གཞི་འདིས `runtime/`, `public/`, export ཡིག་ཆ་དང plugin folder ལ་འབྲི་བ་ཡོད། དེ་ཚོ Vercel ནང་མི་རྟག་པས production ལ་ཕྱི storage དགོས།

</details>

<details>
<summary>العربية</summary>

## العربية

### نظرة عامة

`bendy-nav-nextjs` هو إعادة كتابة لمشروع [mtab](https://github.com/tsxcw/mtab) باستخدام **Next.js 15 + React 19 + TypeScript**. الهدف هو الحفاظ على التوافق القديم ونقل المشروع إلى بنية Node.js حديثة.

### الفروقات الأساسية

- المشروع الأصلي `mtab`: من بنية المستودع وملف `composer.json` يمكن الاستدلال على أنه تطبيق أحادي بأسلوب PHP / ThinkPHP.
- هذا المشروع: يعتمد على Next.js Route Handlers و TypeScript وعميل PostgreSQL لـ Node.js مع طبقة `legacy` للتوافق.
- الإعدادات أصبحت تعتمد على `.env`، بينما `app.config.json` أصبح مساراً قديماً للتوافق فقط.

### التشغيل المحلي

1. شغّل `npm install`
2. انسخ `.env.example` إلى `.env`
3. املأ `DATABASE_URL`
4. شغّل `npm run db:init`
5. شغّل `npm run dev`

### Vercel

Vercel مناسب للمعاينات أو العروض أو السيناريوهات التي تعتمد على القراءة. لكن المشروع ما زال يكتب ملفات إلى `runtime/` و `public/` وملفات التصدير ومجلدات الإضافات. هذه الملفات غير دائمة على Vercel، لذلك يوصى باستخدام تخزين خارجي في بيئة الإنتاج.

</details>

<details>
<summary>Français</summary>

## Français

### Vue d'ensemble

`bendy-nav-nextjs` est une réécriture de [mtab](https://github.com/tsxcw/mtab) avec **Next.js 15 + React 19 + TypeScript**. L'objectif est de conserver la compatibilité legacy tout en migrant le projet vers une pile Node.js moderne.

### Différences majeures

- `mtab` d'origine : la structure publique du dépôt et `composer.json` laissent penser à une architecture monolithique de style PHP / ThinkPHP.
- Ce dépôt : Route Handlers Next.js, modules TypeScript, client PostgreSQL Node.js et couche `legacy` de compatibilité.
- La configuration est désormais normalisée autour de `.env` ; `app.config.json` est déprécié.

### Lancement local

1. `npm install`
2. Copiez `.env.example` vers `.env`
3. Renseignez `DATABASE_URL`
4. Lancez `npm run db:init`
5. Démarrez avec `npm run dev`

### Vercel

Vercel convient pour les previews, les démos ou les usages majoritairement en lecture. En revanche, le projet écrit encore dans `runtime/`, `public/`, les fichiers d'export et les dossiers de plugins. Ces écritures ne sont pas persistantes sur Vercel ; un stockage externe est donc recommandé en production.

</details>
