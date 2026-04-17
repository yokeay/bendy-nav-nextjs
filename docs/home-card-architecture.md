# Home Card Architecture

## Goal

新版首页不再把“卡片”只当成一块可渲染的 UI，而是把它视为一个有明确类型、生命周期和操作边界的领域对象。

这份设计以旧版 `dist` 产物和 `public/static/defaultTab.json` 为基线，目标不是盲目照抄，而是：

- 保留旧版卡片体系的核心心智模型
- 修正旧版把交互、数据和视图混在一起的问题
- 为后续窗口容器、插件卡片、更多动作卡和多端适配留出扩展空间

## Original Taxonomy

旧版首页实际存在 5 类主要卡片，以及 1 类衍生表现层：

### 1. 普通链接卡

- 数据特征：`type = "icon"`、`app = 0`
- 常见字段：`url`、`src`、`name`、`size`、`bgColor`
- 展示态：直接打开外链或站内地址
- 编辑态：支持编辑、删除、加入 Dock、移动分类、拖拽排序
- 创建态：通过 `tab://addicon` 入口创建

### 2. 应用卡

- 数据特征：`type = "icon"`、`app = 1`
- 常见字段：`origin_id`、`custom`
- UI 特征：左下角应用角标
- 行为差异：未来应支持窗口容器、沉浸模式、尺寸和控制按钮配置
- 当前新版：已保留视觉角标，窗口容器行为仍待迁移

### 3. 动作卡

- 数据特征：仍是 `type = "icon"`，但 `url` 为 `tab://...`
- 当前已识别动作：
  - `tab://addicon`
  - `tab://background`
  - `tab://setting`
- 展示态：看起来像普通卡片
- 行为态：点击后不是导航，而是进入创建/设置流程

### 4. 文件夹卡

- 数据特征：`type = "component"`、`component = "iconGroup"`
- 子项关系：通过子卡片 `pid = folderId` 建立
- 展示态：主网格里展示预览九宫格/条形预览
- 交互态：
  - 点击展开容器
  - 编辑时支持子项排序
  - 是卡片收纳容器，不是独立导航目标

### 5. 分组卡

- 数据特征：`type = "pageGroup"`
- UI 位置：不进入主网格，而进入左侧分页栏
- 行为作用：筛选当前桌面可见卡片集合
- 生命周期：创建、编辑、删除、切换

### 6. Dock 卡

- 数据来源：`tabbar`
- 本质：是普通链接卡/应用卡在 Dock 场景下的二次投影
- 不应独立建模为另一种数据实体
- 应单独建模为一种“展示上下文”

## Original Flows

### Display Flow

- 主网格展示：普通链接卡、应用卡、动作卡、文件夹卡
- 侧栏展示：分组卡
- Dock 展示：来自 `tabbar` 的卡片投影
- 文件夹展开后展示：文件夹子卡片

### Edit Flow

- 进入编辑模式后，普通卡片直接暴露快速动作
- 右键菜单提供完整操作集
- 主网格和 Dock 支持拖拽排序
- 文件夹既可打开，也可作为收纳落点

### Create Flow

- 创建普通卡片：动作卡 `添加标签`
- 创建分组：侧栏管理入口或桌面右键菜单
- 创建背景：动作卡 `壁纸`
- 创建设置入口：动作卡 `设置`

## UI Differences That Matter

旧版不是通过完全不同的“卡片样式”区分展示态和编辑态，而是通过同一张卡片上的状态层来切换：

- 展示态：卡片纯净、标签在底部、角标保留
- 编辑态：在同一张卡片上叠加编辑/删除/加入 Dock 控件
- 创建态：不在主网格里直接插入“表单卡片”，而是通过动作卡进入独立流程

这意味着新版不应该把“编辑态卡片”实现成另一套布局；正确方向是：

- 保留统一卡片骨架
- 用状态层叠加操作能力
- 把创建/编辑作为流程，而不是卡片类型本身

## Target Model

建议把首页卡片拆成三层：

### 1. Domain Layer

只描述卡片是什么，不关心怎么画：

- `kind`
  - `link`
  - `app`
  - `action`
  - `folder`
  - `page-group`
- `size`
- `location`
  - root
  - folder
  - dock
  - group-nav
- `capabilities`
  - canOpen
  - canEdit
  - canDelete
  - canPin
  - canMove
  - canContainChildren

### 2. Interaction Layer

描述它在当前模式下允许做什么：

- browse
- edit
- create
- manage-folder
- manage-group

### 3. Presentation Layer

把统一卡片骨架映射到不同场景：

- DesktopCard
- DockCard
- FolderPreviewCard
- GroupNavItem

## Architectural Decisions

### Decision 1

Dock 卡不是独立实体，而是卡片的二次投影。

原因：

- 避免普通卡和 Dock 卡出现双份行为分支
- 未来加入多 Dock、临时栏、推荐栏时可以复用同一投影机制

### Decision 2

动作卡是“行为入口”，不是普通链接卡的特例判断集合。

原因：

- 旧版用 `tab://...` 编码动作语义，新版可以继续兼容旧数据，但内部应显式归类为 `action`
- 后续新增 `tab://theme`、`tab://import` 等动作时不会继续堆字符串判断

### Decision 3

文件夹是“容器卡”，必须和普通卡分开建模。

原因：

- 文件夹有子项集合
- 文件夹有预览布局
- 文件夹支持拖入、拖出、展开和内部排序
- 它不是单纯的链接

### Decision 4

“展示态 / 编辑态 / 创建态”是卡片状态，不是卡片种类。

原因：

- 能保持统一骨架
- 便于做未来动画和可访问性支持
- 减少重复 DOM 结构和 CSS 分支

## Immediate Refactor Direction

### Phase 1

抽出卡片模型工具层：

- 统一卡片分类
- 统一标签解析
- 统一可操作能力判断
- 统一文件夹/分组/动作判定

### Phase 2

把首页渲染拆成卡片骨架和场景变体：

- `BaseCardFrame`
- `LinkCardSurface`
- `FolderCardSurface`
- `ActionCardSurface`
- `DockCardSurface`

### Phase 3

把创建与编辑流程拆成 orchestrator：

- `createCard`
- `updateCard`
- `moveCard`
- `pinCard`
- `groupCard`

### Phase 4

再做 1:1 UI 校准：

- 卡片高度
- 行距
- 宽卡比例
- 文件夹预览布局
- 编辑态浮层位置

## Current Conclusion

这轮应优先把首页卡片系统按“类型 + 状态 + 投影”建模，而不是继续在 `home-page.tsx` 里追加更多条件分支。

这样做的收益：

- 修 UI 时有稳定骨架
- 补动作时不会继续堆 `tab://...` 判断
- 做窗口容器/插件卡片时不需要推倒重来
- 未来做移动端和多布局模式时，卡片能力层可以复用
