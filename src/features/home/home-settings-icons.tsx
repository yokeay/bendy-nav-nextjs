"use client";

import type { CSSProperties, ReactElement } from "react";

type SvgProps = { className?: string; style?: CSSProperties };

const wrap = (d: string) => (p: SvgProps): ReactElement => (
  <svg className={p.className} style={p.style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((seg, i) => (seg.startsWith("c:") ? <circle key={i} cx={Number(seg.split(",")[1])} cy={Number(seg.split(",")[2])} r={Number(seg.split(",")[3])} /> : <path key={i} d={seg} />))}
  </svg>
);

export const IconProfile = wrap("c:,12,8,4|M4 20c0-4 4-6 8-6s8 2 8 6");
export const IconGeneral = wrap("c:,12,12,3|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z");
export const IconTags = wrap("M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z|c:,7,7,1.2");
export const IconWallpaper = wrap("M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z|c:,9,10,2|M21 15l-5-5L5 21");
export const IconTime = wrap("c:,12,12,9|M12 7v5l3 2");
export const IconData = wrap("M3 5c0-1.1 4-2 9-2s9 .9 9 2-4 2-9 2-9-.9-9-2z|M3 5v6c0 1.1 4 2 9 2s9-.9 9-2V5|M3 11v6c0 1.1 4 2 9 2s9-.9 9-2v-6");
export const IconAbout = wrap("c:,12,12,10|M12 8h.01|M11 12h1v5h1");
export const IconImport = wrap("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M7 10l5 5 5-5|M12 15V3");
export const IconExport = wrap("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4|M17 8l-5-5-5 5|M12 3v12");
export const IconReset = wrap("M3 12a9 9 0 0 1 15-6.7L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-15 6.7L3 16|M3 21v-5h5");
export const IconBrowserImport = wrap("M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z|M8 14h8|M10 12v4");

export const SettingsSvgIcon: Record<string, (p: SvgProps) => ReactElement> = {
  profile: IconProfile,
  general: IconGeneral,
  tags: IconTags,
  wallpaper: IconWallpaper,
  time: IconTime,
  data: IconData,
  about: IconAbout,
  import: IconImport,
  export: IconExport,
  reset: IconReset
};
