# Plan

## 2.4.37 Focus

- [x] Reconnect `pageGroupPosition` to the Next.js home sidebar so the side rail can actually switch left/right.
- [x] Reorder settings fields toward the legacy home controller, especially `Dock / 侧栏`, wallpaper opacity, and time field order.
- [x] Restore `opacity` to the wallpaper mask semantics instead of the broken 0-100 pseudo card opacity slider.
- [x] Reconnect `sideBackground` to the sidebar style and settings entry.
- [ ] Continue closing the remaining gaps around `LinkTitle` and exact per-field parity with `latest/mtab`.

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

当前版本：`2.4.37`

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
- [ ] 常驻保留“新增页面 / 页面管理”入口，不再隐藏在编辑态内部。
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

- [ ] 对齐应用卡 `app = 1` 的窗口容器行为，不只保留角标。
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
