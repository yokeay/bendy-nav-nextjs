"use client";

import { useMemo, useState } from "react";
import type { HomeConfig, HomeSiteInfo } from "@/server/home/types";
import iconStyles from "./home-settings-icons.module.css";
import styles from "./home-page.module.css";

type SettingsSection = "profile" | "general" | "tags" | "wallpaper" | "time" | "data" | "about";

type HomeSettingsDialogProps = {
  open: boolean;
  config: HomeConfig;
  site: HomeSiteInfo;
  saving: boolean;
  loggedIn: boolean;
  pageCount: number;
  searchHistoryEnabled: boolean;
  snapshots: Array<{
    id: string;
    createdAt: string;
  }>;
  onClose: () => void;
  onSave: () => void;
  onOpenPageManager: () => void;
  onOpenAuth: () => void;
  onOpenBackground: () => void;
  onImportBackup: () => void;
  onExportBackup: () => void;
  onResetHome: () => void;
  onSearchHistoryChange: (enabled: boolean) => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onConfigChange: (nextConfig: HomeConfig) => void;
};

type ToggleRowProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

type RangeRowProps = {
  label: string;
  description: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  suffix?: string;
  onChange: (value: number) => void;
};

type ColorRowProps = {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
};

type ActionRowProps = {
  label: string;
  description: string;
  actionLabel: string;
  onClick: () => void;
  danger?: boolean;
  iconClassName?: string;
};

const SECTION_OPTIONS: Array<{ id: SettingsSection; label: string; iconClassName: string }> = [
  { id: "general", label: "常规设置", iconClassName: iconStyles.glyphGeneral },
  { id: "tags", label: "主题标签", iconClassName: iconStyles.glyphTags },
  { id: "wallpaper", label: "壁纸设置", iconClassName: iconStyles.glyphWallpaper },
  { id: "time", label: "时间日期", iconClassName: iconStyles.glyphTime },
  { id: "data", label: "数据变动记录", iconClassName: iconStyles.glyphData },
  { id: "about", label: "关于我们", iconClassName: iconStyles.glyphAbout }
];

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowText}>
        <p className={styles.settingRowTitle}>{label}</p>
        <p className={styles.settingRowDescription}>{description}</p>
      </div>
      <button
        className={checked ? `${styles.settingSwitch} ${styles.settingSwitchOn}` : styles.settingSwitch}
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span />
      </button>
    </div>
  );
}

function RangeRow({
  label,
  description,
  min,
  max,
  step = 1,
  value,
  suffix = "",
  onChange
}: RangeRowProps) {
  return (
    <div className={styles.settingRowBlock}>
      <div className={styles.settingRowText}>
        <p className={styles.settingRowTitle}>{label}</p>
        <p className={styles.settingRowDescription}>{description}</p>
      </div>
      <div className={styles.settingRangeMeta}>
        <span>
          {value}
          {suffix}
        </span>
      </div>
      <input
        className={styles.settingRange}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ColorRow({ label, description, value, onChange }: ColorRowProps) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowText}>
        <p className={styles.settingRowTitle}>{label}</p>
        <p className={styles.settingRowDescription}>{description}</p>
      </div>
      <label className={styles.settingColorField}>
        <input
          className={styles.settingColorInput}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

function ActionRow({ label, description, actionLabel, onClick, danger = false, iconClassName }: ActionRowProps) {
  return (
    <div className={styles.controlActionRow}>
      <div className={styles.controlActionMeta}>
        <p className={styles.settingRowTitle}>
          {iconClassName ? <span className={`${iconStyles.glyph} ${iconClassName} ${styles.controlActionGlyph}`} /> : null}
          {label}
        </p>
        <p className={styles.settingRowDescription}>{description}</p>
      </div>
      <button
        className={danger ? `${styles.controlActionButton} ${styles.controlActionButtonDanger}` : styles.controlActionButton}
        type="button"
        onClick={onClick}
      >
        <span>{actionLabel}</span>
        <span className={styles.controlActionArrow}>›</span>
      </button>
    </div>
  );
}

function mergeSectionValue(
  config: HomeConfig,
  section: keyof HomeConfig,
  key: string,
  value: boolean | number | string
): HomeConfig {
  return {
    ...config,
    [section]: {
      ...config[section],
      [key]: value
    }
  };
}

export function HomeSettingsDialog({
  open,
  config,
  site,
  saving,
  loggedIn,
  pageCount,
  searchHistoryEnabled,
  snapshots,
  onClose,
  onSave,
  onOpenPageManager,
  onOpenAuth,
  onOpenBackground,
  onImportBackup,
  onExportBackup,
  onResetHome,
  onSearchHistoryChange,
  onRestoreSnapshot,
  onConfigChange
}: HomeSettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  const sideClassName = useMemo(
    () =>
      config.theme.userCenterPosition === "right"
        ? `${styles.controlModel} ${styles.controlModelRight}`
        : `${styles.controlModel} ${styles.controlModelLeft}`,
    [config.theme.userCenterPosition]
  );

  if (!open) {
    return null;
  }

  const updateOpenType = (key: keyof HomeConfig["openType"], value: boolean) => {
    onConfigChange(mergeSectionValue(config, "openType", key, value));
  };

  const updateThemeBoolean = (key: keyof HomeConfig["theme"], value: boolean) => {
    onConfigChange(mergeSectionValue(config, "theme", key, value));
  };

  const updateThemeNumber = (key: keyof HomeConfig["theme"], value: number) => {
    onConfigChange(mergeSectionValue(config, "theme", key, value));
  };

  const updateThemeString = (key: keyof HomeConfig["theme"], value: string) => {
    onConfigChange(mergeSectionValue(config, "theme", key, value));
  };

  return (
    <div className={styles.controlCenter} onClick={onClose}>
      <div className={sideClassName} onClick={(event) => event.stopPropagation()}>
        <aside className={styles.controlMenu}>
          <button
            className={
              activeSection === "profile"
                ? `${styles.controlUserCard} ${styles.controlUserCardActive}`
                : styles.controlUserCard
            }
            type="button"
            onClick={() => setActiveSection("profile")}
          >
            <div className={styles.controlUserCardAvatar}>{site.title.slice(0, 1)}</div>
            <div className={styles.controlUserCardMeta}>
              <strong>{loggedIn ? site.title : "游客"}</strong>
              <span>{loggedIn ? "登录后配置已同步" : "未登录，当前仅保存在本地"}</span>
            </div>
          </button>

          <div className={styles.controlMenuList}>
            {SECTION_OPTIONS.map((item) => (
              <button
                key={item.id}
                className={
                  item.id === activeSection
                    ? `${styles.controlMenuItem} ${styles.controlMenuItemActive}`
                    : styles.controlMenuItem
                }
                type="button"
                onClick={() => setActiveSection(item.id)}
              >
                <span className={`${iconStyles.glyph} ${item.iconClassName} ${styles.controlMenuGlyph}`} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.controlSetting}>
          <div className={styles.controlBox}>
            {activeSection === "profile" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  {loggedIn ? (
                    <div className={styles.controlHero}>
                      <div className={styles.controlHeroLogo}>{site.title.slice(0, 1)}</div>
                      <p className={styles.controlHeroText}>当前账户配置会跟随首页一起同步保存。</p>
                      <button className={styles.controlHeroButton} type="button" onClick={onOpenPageManager}>
                        打开页面管理
                      </button>
                    </div>
                  ) : (
                    <div className={styles.controlHero}>
                      <div className={styles.controlHeroLogo}>{site.title.slice(0, 1)}</div>
                      <p className={styles.controlHeroText}>登录后即可享更多功能和数据同步</p>
                      <button className={styles.controlHeroButton} type="button" onClick={onOpenAuth}>
                        立即登录
                      </button>
                    </div>
                  )}

                  <ActionRow
                    label="导入书签备份"
                    description="从导出的 JSON 备份恢复首页数据。"
                    actionLabel="导入"
                    iconClassName={iconStyles.glyphImport}
                    onClick={onImportBackup}
                  />
                  <ActionRow
                    label="导出书签备份"
                    description="导出当前首页标签、Dock 和设置快照。"
                    actionLabel="导出"
                    iconClassName={iconStyles.glyphExport}
                    onClick={onExportBackup}
                  />
                  <ActionRow
                    label="重置标签"
                    description="回到项目默认首页数据。"
                    actionLabel="重置"
                    iconClassName={iconStyles.glyphReset}
                    onClick={onResetHome}
                    danger
                  />
                </section>
              </div>
            ) : null}

            {activeSection === "general" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>常规设置</h3>
                  <ToggleRow
                    label="搜索新页面打开"
                    description="对应旧版 searchOpen。"
                    checked={config.openType.searchOpen}
                    onChange={(value) => updateOpenType("searchOpen", value)}
                  />
                  <ToggleRow
                    label="标签新页面打开"
                    description="对应旧版 linkOpen。"
                    checked={config.openType.linkOpen}
                    onChange={(value) => updateOpenType("linkOpen", value)}
                  />
                  <ToggleRow
                    label="进入程序自动聚焦搜索"
                    description="对应旧版 autofocus。"
                    checked={config.openType.autofocus}
                    onChange={(value) => updateOpenType("autofocus", value)}
                  />
                  <ToggleRow
                    label="搜索词联想功能"
                    description="对应旧版 searchRecommend。"
                    checked={config.openType.searchRecommend}
                    onChange={(value) => updateOpenType("searchRecommend", value)}
                  />
                  <ToggleRow
                    label="搜索功能"
                    description="控制首页搜索框显隐。"
                    checked={config.openType.searchStatus}
                    onChange={(value) => updateOpenType("searchStatus", value)}
                  />
                  <ToggleRow
                    label="搜索历史"
                    description="仅本地生效，关闭后会清空现有搜索历史。"
                    checked={searchHistoryEnabled}
                    onChange={onSearchHistoryChange}
                  />
                  <ToggleRow
                    label="图标快捷搜索展示"
                    description="控制搜索面板中的本地图标搜索结果。"
                    checked={config.openType.searchLink}
                    onChange={(value) => updateOpenType("searchLink", value)}
                  />
                </section>
              </div>
            ) : null}

            {activeSection === "tags" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>主题标签</h3>
                  <RangeRow
                    label="图标尺寸"
                    description="对应旧版 iconWidth。"
                    min={48}
                    max={96}
                    value={config.theme.iconWidth}
                    suffix="px"
                    onChange={(value) => updateThemeNumber("iconWidth", value)}
                  />
                  <RangeRow
                    label="图标圆角"
                    description="对应旧版 iconRadius。"
                    min={4}
                    max={28}
                    value={config.theme.iconRadius}
                    suffix="px"
                    onChange={(value) => updateThemeNumber("iconRadius", value)}
                  />
                  <RangeRow
                    label="卡片透明度"
                    description="对应旧版 opacity。"
                    min={0}
                    max={100}
                    value={config.theme.opacity}
                    suffix="%"
                    onChange={(value) => updateThemeNumber("opacity", value)}
                  />
                  <RangeRow
                    label="列间距"
                    description="对应旧版 colsGap。"
                    min={8}
                    max={56}
                    value={config.theme.colsGap}
                    suffix="px"
                    onChange={(value) => updateThemeNumber("colsGap", value)}
                  />
                  <RangeRow
                    label="最大列数"
                    description="控制首页网格最大列数。"
                    min={3}
                    max={12}
                    value={config.theme.maxColumn}
                    onChange={(value) => updateThemeNumber("maxColumn", value)}
                  />
                  <ColorRow
                    label="标签文字颜色"
                    description="对应旧版 nameColor。"
                    value={config.theme.nameColor}
                    onChange={(value) => updateThemeString("nameColor", value)}
                  />
                  <ToggleRow
                    label="显示图标底板"
                    description="对应旧版 iconBg。"
                    checked={config.theme.iconBg}
                    onChange={(value) => updateThemeBoolean("iconBg", value)}
                  />
                  <ToggleRow
                    label="显示标签名称"
                    description="对应旧版 LinkTitle。"
                    checked={config.theme.LinkTitle}
                    onChange={(value) => updateThemeBoolean("LinkTitle", value)}
                  />
                  <ToggleRow
                    label="显示分页栏"
                    description="控制侧边分页是否展示。"
                    checked={config.theme.pageGroup}
                    onChange={(value) => updateThemeBoolean("pageGroup", value)}
                  />
                  <ToggleRow
                    label="自动隐藏分页栏"
                    description="桌面端启用边缘唤出效果。"
                    checked={config.theme.pageGroupStatus}
                    onChange={(value) => updateThemeBoolean("pageGroupStatus", value)}
                  />
                </section>
              </div>
            ) : null}

            {activeSection === "wallpaper" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>壁纸设置</h3>
                  <ActionRow
                    label="打开壁纸库"
                    description="进入壁纸面板切换默认背景和自定义背景。"
                    actionLabel="打开"
                    onClick={onOpenBackground}
                  />
                  <RangeRow
                    label="背景模糊"
                    description="对应旧版 blur。"
                    min={0}
                    max={40}
                    value={config.theme.blur}
                    suffix="px"
                    onChange={(value) => updateThemeNumber("blur", value)}
                  />
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>主题模式</p>
                      <p className={styles.settingRowDescription}>控制首页与设置面板的浅色、深色或跟随系统。</p>
                    </div>
                    <div className={styles.segmented}>
                      <button
                        className={
                          (config.theme.themeMode ?? "auto") === "auto"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("themeMode", "auto")}
                      >
                        跟随系统
                      </button>
                      <button
                        className={
                          config.theme.themeMode === "light"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("themeMode", "light")}
                      >
                        浅色
                      </button>
                      <button
                        className={
                          config.theme.themeMode === "dark"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("themeMode", "dark")}
                      >
                        深色
                      </button>
                    </div>
                  </div>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>控制中心位置</p>
                      <p className={styles.settingRowDescription}>控制设置中心从左下角还是右下角弹出。</p>
                    </div>
                    <div className={styles.segmented}>
                      <button
                        className={
                          config.theme.userCenterPosition === "left"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("userCenterPosition", "left")}
                      >
                        左下
                      </button>
                      <button
                        className={
                          config.theme.userCenterPosition === "right"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("userCenterPosition", "right")}
                      >
                        右下
                      </button>
                    </div>
                  </div>
                  <ToggleRow
                    label="底部优先布局"
                    description="对应旧版 bottom2top。"
                    checked={config.theme.bottom2top}
                    onChange={(value) => updateThemeBoolean("bottom2top", value)}
                  />
                </section>
              </div>
            ) : null}

            {activeSection === "time" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>时间日期</h3>
                  <ColorRow
                    label="时间文字颜色"
                    description="对应旧版 timeColor。"
                    value={config.theme.timeColor}
                    onChange={(value) => updateThemeString("timeColor", value)}
                  />
                  <ToggleRow
                    label="显示时间"
                    description="对应旧版 timeView。"
                    checked={config.theme.timeView}
                    onChange={(value) => updateThemeBoolean("timeView", value)}
                  />
                  <ToggleRow
                    label="24 小时制"
                    description="对应旧版 time24。"
                    checked={config.theme.time24}
                    onChange={(value) => updateThemeBoolean("time24", value)}
                  />
                  <ToggleRow
                    label="显示秒钟"
                    description="对应旧版 timeSecond。"
                    checked={config.theme.timeSecond}
                    onChange={(value) => updateThemeBoolean("timeSecond", value)}
                  />
                  <ToggleRow
                    label="显示月日"
                    description="对应旧版 timeMonthDay。"
                    checked={config.theme.timeMonthDay}
                    onChange={(value) => updateThemeBoolean("timeMonthDay", value)}
                  />
                  <ToggleRow
                    label="显示星期"
                    description="对应旧版 timeWeek。"
                    checked={config.theme.timeWeek}
                    onChange={(value) => updateThemeBoolean("timeWeek", value)}
                  />
                  <ToggleRow
                    label="显示农历"
                    description="对应旧版 timeLunar。"
                    checked={config.theme.timeLunar}
                    onChange={(value) => updateThemeBoolean("timeLunar", value)}
                  />
                  <ToggleRow
                    label="显示干支"
                    description="对应旧版 timeGanZhi。"
                    checked={config.theme.timeGanZhi}
                    onChange={(value) => updateThemeBoolean("timeGanZhi", value)}
                  />
                </section>
              </div>
            ) : null}

            {activeSection === "data" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>数据变动记录</h3>
                  <ActionRow
                    label="页面管理"
                    description={`当前已有 ${pageCount} 个页面，可继续新增和调整排序。`}
                    actionLabel="打开"
                    onClick={onOpenPageManager}
                  />
                  <ToggleRow
                    label="恢复上次页面"
                    description="开启后优先恢复上次停留的页面。"
                    checked={config.theme.latestPageGroup}
                    onChange={(value) => updateThemeBoolean("latestPageGroup", value)}
                  />
                  <ToggleRow
                    label="显示底部 Dock"
                    description="保留旧版底部快捷栏。"
                    checked={config.theme.tabbar}
                    onChange={(value) => updateThemeBoolean("tabbar", value)}
                  />
                  <ToggleRow
                    label="简洁模式显示 Dock"
                    description="对应旧版 tabbarMode。"
                    checked={config.theme.tabbarMode}
                    onChange={(value) => updateThemeBoolean("tabbarMode", value)}
                  />
                  <ToggleRow
                    label="显示垃圾桶"
                    description="编辑模式下显示底部移除区域。"
                    checked={config.theme.trash}
                    onChange={(value) => updateThemeBoolean("trash", value)}
                  />
                  <div className={styles.settingHistoryList}>
                    {snapshots.length > 0 ? (
                      snapshots.slice(0, 8).map((snapshot) => (
                        <div className={styles.settingHistoryItem} key={snapshot.id}>
                          <div className={styles.settingHistoryMeta}>
                            <strong>{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</strong>
                            <span>恢复桌面标签至该时间节点</span>
                          </div>
                          <button
                            className={styles.controlInlineButton}
                            type="button"
                            onClick={() => onRestoreSnapshot(snapshot.id)}
                          >
                            恢复
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className={styles.settingHistoryEmpty}>当前还没有可恢复的历史快照。</div>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {activeSection === "about" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>关于我们</h3>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>站点标题</p>
                      <p className={styles.settingRowDescription}>{site.title}</p>
                    </div>
                  </div>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>描述</p>
                      <p className={styles.settingRowDescription}>{site.description || "未配置"}</p>
                    </div>
                  </div>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>关键词</p>
                      <p className={styles.settingRowDescription}>{site.keywords || "未配置"}</p>
                    </div>
                  </div>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>ICP备案</p>
                      <p className={styles.settingRowDescription}>{site.recordNumber || "未配置"}</p>
                    </div>
                  </div>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>公安备案</p>
                      <p className={styles.settingRowDescription}>{site.beianMps || "未配置"}</p>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>

          <div className={styles.controlFooter}>
            <button className={styles.controlFooterSecondary} type="button" onClick={onClose}>
              取消
            </button>
            <button className={styles.controlFooterPrimary} type="button" onClick={onSave} disabled={saving}>
              {saving ? "保存中..." : loggedIn ? "保存到当前账户" : "保存到本地浏览器"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
