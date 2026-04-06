export type HomeLinkType = "icon" | "pageGroup" | "component";

export type HomeLink = {
  id: string;
  app: number;
  pid: string | null;
  src: string;
  url: string;
  name: string;
  size: string;
  sort: number;
  type: HomeLinkType;
  bgColor: string | null;
  pageGroup: string;
  form: string;
  component: string | null;
  tips: string;
  custom: Record<string, unknown> | null;
  originId: number | null;
};

export type HomeOpenType = {
  searchStatus: boolean;
  searchOpen: boolean;
  linkOpen: boolean;
  autofocus: boolean;
  searchLink: boolean;
  searchRecommend: boolean;
  tabbar: boolean;
};

export type HomeTheme = {
  themeMode?: "auto" | "light" | "dark";
  backgroundImage: string;
  backgroundMime: number;
  blur: number;
  timeColor: string;
  tabbar: boolean;
  tabbarMode: boolean;
  iconWidth: number;
  iconBg: boolean;
  LinkTitle: boolean;
  iconRadius: number;
  CompactMode: boolean;
  nameColor: string;
  opacity: number;
  colsGap: number;
  pageGroup: boolean;
  pageGroupStatus: boolean;
  timeView: boolean;
  timeWeek: boolean;
  timeGanZhi: boolean;
  timeSecond: boolean;
  timeMonthDay: boolean;
  timeLunar: boolean;
  time24: boolean;
  maxColumn: number;
  latestPageGroup: boolean;
  bottom2top: boolean;
  userCenterPosition: string;
  trash: boolean;
  pageGroupPosition: "left" | "right";
};

export type HomeConfig = {
  openType: HomeOpenType;
  theme: HomeTheme;
};

export type HomeSiteInfo = {
  title: string;
  description: string;
  keywords: string;
  logo: string;
  favicon: string;
  recordNumber: string;
  beianMps: string;
  copyright: string;
  mobileRecordNumber: string;
  allowRegister: boolean;
  authCheckMode: "email_code" | "old_password";
  qqLoginEnabled: boolean;
  wxLoginEnabled: boolean;
  isPushLinkStore: boolean;
  isPushLinkStatus: boolean;
  isPushLinkStoreTips: string;
};

export type HomeUser = {
  userId: number;
  groupId: number;
  manager: boolean;
  email: string;
  nickname: string;
  avatar: string;
};

export type HomeNotice = {
  title: string;
  message: string;
};

export type HomeSearchEngine = {
  key: string;
  name: string;
  icon: string;
  action: string;
  queryParam: string;
};

export type HomeAuthCookies = {
  userId?: string;
  token?: string;
};

export type HomeData = {
  legacyUrl: string;
  site: HomeSiteInfo;
  config: HomeConfig;
  links: HomeLink[];
  tabbar: HomeLink[];
  pageGroups: HomeLink[];
  searchEngines: HomeSearchEngine[];
  user: HomeUser | null;
  notice: HomeNotice | null;
};
