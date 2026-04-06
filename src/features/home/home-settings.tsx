"use client";

import { useMemo, useState } from "react";
import type { HomeConfig, HomeSiteInfo } from "@/server/home/types";
import styles from "./home-page.module.css";

type SettingsSection = "user" | "theme" | "open" | "about";

type HomeSettingsDialogProps = {
  open: boolean;
  config: HomeConfig;
  site: HomeSiteInfo;
  saving: boolean;
  loggedIn: boolean;
  pageCount: number;
  onClose: () => void;
  onSave: () => void;
  onOpenPageManager: () => void;
  onConfigChange: (nextConfig: HomeConfig) => void;
};

const SECTION_OPTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "user", label: "用户中心" },
  { id: "theme", label: "主题外观" },
  { id: "open", label: "打开方式" },
  { id: "about", label: "关于" }
];

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
  onClose,
  onSave,
  onOpenPageManager,
  onConfigChange
}: HomeSettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("theme");

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
          <div className={styles.controlUserHeader}>
            <div className={styles.controlUserAvatar}>{site.title.slice(0, 1)}</div>
            <div className={styles.controlUserMeta}>
              <strong>{site.title}</strong>
              <span>{loggedIn ? "当前账户配置" : "访客本地配置"}</span>
            </div>
          </div>

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
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className={styles.controlSetting}>
          <div className={styles.controlBox}>
            {activeSection === "user" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>用户中心</h3>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>当前存储位置</p>
                      <p className={styles.settingRowDescription}>
                        {loggedIn ? "设置修改后会同步到当前账户。" : "访客模式下仅保存在当前浏览器。"}
                      </p>
                    </div>
                  </div>
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>页面管理</p>
                      <p className={styles.settingRowDescription}>当前已有 {pageCount} 个页面，可继续新增和调整排序。</p>
                    </div>
                    <button className={styles.controlInlineButton} type="button" onClick={onOpenPageManager}>
                      打开页面管理
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {activeSection === "theme" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>主题外观</h3>
                  <RangeRow
                    label="背景模糊"
                    description="对应旧版 blur。"
                    min={0}
                    max={40}
                    value={config.theme.blur}
                    suffix="px"
                    onChange={(value) => updateThemeNumber("blur", value)}
                  />
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
                    min={20}
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
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>主题模式</p>
                      <p className={styles.settingRowDescription}>控制新版首页与控制中心使用浅色、深色或跟随系统。</p>
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
                  <ColorRow
                    label="标签文字颜色"
                    description="对应旧版 nameColor。"
                    value={config.theme.nameColor}
                    onChange={(value) => updateThemeString("nameColor", value)}
                  />
                  <ColorRow
                    label="时间文字颜色"
                    description="对应旧版 timeColor。"
                    value={config.theme.timeColor}
                    onChange={(value) => updateThemeString("timeColor", value)}
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
                  <ToggleRow
                    label="底部优先布局"
                    description="对应旧版 bottom2top。"
                    checked={config.theme.bottom2top}
                    onChange={(value) => updateThemeBoolean("bottom2top", value)}
                  />
                  <ToggleRow
                    label="恢复上次页面"
                    description="开启后优先恢复上次停留的页面。"
                    checked={config.theme.latestPageGroup}
                    onChange={(value) => updateThemeBoolean("latestPageGroup", value)}
                  />
                  <div className={styles.settingRowBlock}>
                    <div className={styles.settingRowText}>
                      <p className={styles.settingRowTitle}>页面栏位置</p>
                      <p className={styles.settingRowDescription}>控制页面栏靠左或靠右停靠。</p>
                    </div>
                    <div className={styles.segmented}>
                      <button
                        className={
                          config.theme.pageGroupPosition === "left"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("pageGroupPosition", "left")}
                      >
                        左侧
                      </button>
                      <button
                        className={
                          config.theme.pageGroupPosition === "right"
                            ? `${styles.segmentedItem} ${styles.segmentedItemActive}`
                            : styles.segmentedItem
                        }
                        type="button"
                        onClick={() => updateThemeString("pageGroupPosition", "right")}
                      >
                        右侧
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
                </section>
              </div>
            ) : null}

            {activeSection === "open" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>打开方式</h3>
                  <ToggleRow
                    label="搜索结果新标签页打开"
                    description="对应旧版 searchOpen。"
                    checked={config.openType.searchOpen}
                    onChange={(value) => updateOpenType("searchOpen", value)}
                  />
                  <ToggleRow
                    label="导航链接新标签页打开"
                    description="对应旧版 linkOpen。"
                    checked={config.openType.linkOpen}
                    onChange={(value) => updateOpenType("linkOpen", value)}
                  />
                  <ToggleRow
                    label="自动聚焦搜索框"
                    description="对应旧版 autofocus。"
                    checked={config.openType.autofocus}
                    onChange={(value) => updateOpenType("autofocus", value)}
                  />
                  <ToggleRow
                    label="显示搜索框"
                    description="关闭后首页只保留时间与导航区域。"
                    checked={config.openType.searchStatus}
                    onChange={(value) => updateOpenType("searchStatus", value)}
                  />
                  <ToggleRow
                    label="显示搜索推荐"
                    description="控制搜索面板中的推荐词与快捷搜索。"
                    checked={config.openType.searchRecommend}
                    onChange={(value) => updateOpenType("searchRecommend", value)}
                  />
                  <ToggleRow
                    label="显示图标搜索结果"
                    description="控制搜索面板中的本地图标搜索结果。"
                    checked={config.openType.searchLink}
                    onChange={(value) => updateOpenType("searchLink", value)}
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
                </section>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>时间组件</h3>
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

            {activeSection === "about" ? (
              <div className={styles.controlSectionStack}>
                <section className={styles.controlSectionCard}>
                  <h3 className={styles.controlSectionTitle}>关于</h3>
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
