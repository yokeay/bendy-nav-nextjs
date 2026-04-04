"use client";

import { useState } from "react";
import type { HomeConfig, HomeSiteInfo } from "@/server/home/types";
import styles from "./home-page.module.css";

type SettingsSection = "layout" | "search" | "time" | "appearance";

type HomeSettingsDialogProps = {
  open: boolean;
  config: HomeConfig;
  site: HomeSiteInfo;
  saving: boolean;
  loggedIn: boolean;
  onClose: () => void;
  onSave: () => void;
  onConfigChange: (nextConfig: HomeConfig) => void;
};

const SECTION_OPTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "layout", label: "布局" },
  { id: "search", label: "搜索" },
  { id: "time", label: "时间" },
  { id: "appearance", label: "外观" }
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
  onClose,
  onSave,
  onConfigChange
}: HomeSettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("layout");

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
    <div className={styles.settingsBackdrop} onClick={onClose}>
      <div className={styles.settingsDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.settingsHeader}>
          <div>
            <p className={styles.settingsEyebrow}>设置中心</p>
            <h2 className={styles.settingsTitle}>{site.title}</h2>
            <p className={styles.settingsDescription}>
              {loggedIn ? "修改后会写回当前账户配置。" : "访客模式下会保存在当前浏览器。"}
            </p>
          </div>
          <button className={styles.settingsClose} type="button" onClick={onClose} aria-label="关闭设置">
            ×
          </button>
        </div>

        <div className={styles.settingsLayout}>
          <div className={styles.settingsNav}>
            {SECTION_OPTIONS.map((item) => (
              <button
                key={item.id}
                className={
                  item.id === activeSection
                    ? `${styles.settingsNavItem} ${styles.settingsNavItemActive}`
                    : styles.settingsNavItem
                }
                type="button"
                onClick={() => setActiveSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.settingsContent}>
            {activeSection === "layout" ? (
              <section className={styles.settingsSection}>
              <h3 className={styles.settingsSectionTitle}>布局</h3>
              <ToggleRow
                label="简洁模式"
                description="对应旧版 CompactMode，开启后收起主网格，只保留时间和搜索。"
                checked={config.theme.CompactMode}
                onChange={(value) => updateThemeBoolean("CompactMode", value)}
              />
              <ToggleRow
                label="显示分页栏"
                description="控制左侧分组导航是否展示。"
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
                label="显示底部 Dock"
                description="保留旧版页脚快捷栏。"
                checked={config.theme.tabbar}
                onChange={(value) => updateThemeBoolean("tabbar", value)}
              />
              <ToggleRow
                label="简洁模式显示 Dock"
                description="旧版 tabbarMode，简洁模式下仍显示底部 Dock。"
                checked={config.theme.tabbarMode}
                onChange={(value) => updateThemeBoolean("tabbarMode", value)}
              />
              <div className={styles.settingRowBlock}>
                <div className={styles.settingRowText}>
                  <p className={styles.settingRowTitle}>分页栏位置</p>
                  <p className={styles.settingRowDescription}>控制左侧分组栏停靠方向。</p>
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
              </section>
            ) : null}

            {activeSection === "search" ? (
              <section className={styles.settingsSection}>
              <h3 className={styles.settingsSectionTitle}>搜索</h3>
              <ToggleRow
                label="显示搜索框"
                description="关闭后首页仅保留时间和导航区。"
                checked={config.openType.searchStatus}
                onChange={(value) => updateOpenType("searchStatus", value)}
              />
              <ToggleRow
                label="搜索结果新标签页打开"
                description="旧版 searchOpen 配置。"
                checked={config.openType.searchOpen}
                onChange={(value) => updateOpenType("searchOpen", value)}
              />
              <ToggleRow
                label="导航链接新标签页打开"
                description="旧版 linkOpen 配置。"
                checked={config.openType.linkOpen}
                onChange={(value) => updateOpenType("linkOpen", value)}
              />
              <ToggleRow
                label="自动聚焦搜索框"
                description="旧版 autofocus 配置。"
                checked={config.openType.autofocus}
                onChange={(value) => updateOpenType("autofocus", value)}
              />
              <ToggleRow
                label="显示搜索联想"
                description="旧版 searchRecommend 配置。当前新版先保留开关，后续补推荐内容。"
                checked={config.openType.searchRecommend}
                onChange={(value) => updateOpenType("searchRecommend", value)}
              />
              </section>
            ) : null}

            {activeSection === "time" ? (
              <section className={styles.settingsSection}>
              <h3 className={styles.settingsSectionTitle}>时间</h3>
              <ToggleRow
                label="显示时间面板"
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
                label="显示秒数"
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
            ) : null}

            {activeSection === "appearance" ? (
              <section className={styles.settingsSection}>
              <h3 className={styles.settingsSectionTitle}>外观</h3>
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
              </section>
            ) : null}
          </div>
        </div>

        <div className={styles.settingsFooter}>
          <button className={styles.settingsFooterSecondary} type="button" onClick={onClose}>
            取消
          </button>
          <button className={styles.settingsFooterPrimary} type="button" onClick={onSave} disabled={saving}>
            {saving ? "保存中..." : loggedIn ? "保存到当前账户" : "保存到本地浏览器"}
          </button>
        </div>
      </div>
    </div>
  );
}
