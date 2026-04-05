import type { HomeLink } from "@/server/home/types";

export type HomeCardKind = "link" | "app" | "action" | "folder" | "page-group";

export type HomeActionCardType = "add-link" | "background" | "settings" | null;

export type HomeCardCapabilities = {
  canOpen: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  canMove: boolean;
  canContainChildren: boolean;
};

const ACTION_CARD_URL_MAP: Record<string, Exclude<HomeActionCardType, null>> = {
  "tab://addicon": "add-link",
  "tab://background": "background",
  "tab://setting": "settings"
};

export function isSpecialHomeCardLink(link: HomeLink): boolean {
  return link.url.startsWith("tab://");
}

export function isTextHomeCard(link: HomeLink): boolean {
  return link.src.startsWith("txt:");
}

export function isAppHomeCard(link: HomeLink): boolean {
  return link.app === 1;
}

export function isFolderHomeCard(link: HomeLink): boolean {
  return link.type === "component" && link.component === "iconGroup";
}

export function isPageGroupHomeCard(link: HomeLink): boolean {
  return link.type === "pageGroup";
}

export function getHomeActionCardType(link: HomeLink): HomeActionCardType {
  return ACTION_CARD_URL_MAP[link.url] ?? null;
}

export function isActionHomeCard(link: HomeLink): boolean {
  return getHomeActionCardType(link) !== null;
}

export function getHomeCardKind(link: HomeLink): HomeCardKind {
  if (isPageGroupHomeCard(link)) {
    return "page-group";
  }

  if (isFolderHomeCard(link)) {
    return "folder";
  }

  if (isActionHomeCard(link)) {
    return "action";
  }

  if (isAppHomeCard(link)) {
    return "app";
  }

  return "link";
}

export function isRenderableHomeCard(link: HomeLink): boolean {
  return isFolderHomeCard(link) || (link.type === "icon" && !isSpecialHomeCardLink(link));
}

export function canEditHomeCard(link: HomeLink): boolean {
  return link.type === "icon" && !isSpecialHomeCardLink(link);
}

export function resolveHomeCardLabel(link: HomeLink): string {
  return link.name || link.tips || link.url || "未命名";
}

export function resolveHomeGroupId(links: HomeLink[]) {
  const homeGroup = links.find((item) => isPageGroupHomeCard(item) && resolveHomeCardLabel(item) === "首页");
  return homeGroup?.id ?? "";
}

export function normalizeHomeLinksOrder(links: HomeLink[]) {
  return [...links].sort((left, right) => {
    if (left.sort === right.sort) {
      return left.id.localeCompare(right.id);
    }

    return left.sort - right.sort;
  });
}

export function buildFolderChildren(links: HomeLink[], folderId: string) {
  return normalizeHomeLinksOrder(
    links.filter((item) => item.pid === folderId && item.type === "icon" && !isSpecialHomeCardLink(item))
  );
}

export function buildVisibleHomeCards(links: HomeLink[], activeGroupId: string, homeGroupId = "") {
  return [...links]
    .filter((item) => {
      if (isPageGroupHomeCard(item)) {
        return false;
      }

      if (item.pid) {
        return false;
      }

      if (!isRenderableHomeCard(item) && !isActionHomeCard(item)) {
        return false;
      }

      if (activeGroupId) {
        return item.pageGroup === activeGroupId;
      }

      if (homeGroupId) {
        return !item.pageGroup || item.pageGroup === homeGroupId;
      }

      return !item.pageGroup;
    })
    .sort((left, right) => {
      if (left.sort === right.sort) {
        return left.id.localeCompare(right.id);
      }

      return left.sort - right.sort;
    });
}

export function getNextFolderSort(links: HomeLink[], folderId: string) {
  const children = links.filter((item) => item.pid === folderId);
  if (children.length === 0) {
    return 0;
  }

  return Math.max(...children.map((item) => item.sort), -1) + 1;
}

export function getNextRootSort(links: HomeLink[], groupId: string, homeGroupId = "") {
  const rootTiles = links.filter((item) => {
    if (isPageGroupHomeCard(item)) {
      return false;
    }

    if (item.pid) {
      return false;
    }

    if (!isRenderableHomeCard(item)) {
      return false;
    }

    if (groupId) {
      return item.pageGroup === groupId;
    }

    if (homeGroupId) {
      return !item.pageGroup || item.pageGroup === homeGroupId;
    }

    return !item.pageGroup;
  });

  if (rootTiles.length === 0) {
    return 0;
  }

  return Math.max(...rootTiles.map((item) => item.sort), -1) + 1;
}

export function getHomeCardCapabilities(link: HomeLink): HomeCardCapabilities {
  const kind = getHomeCardKind(link);

  return {
    canOpen: kind === "link" || kind === "app" || kind === "folder" || kind === "action",
    canEdit: kind === "link" || kind === "app",
    canDelete: kind !== "page-group",
    canPin: kind === "link" || kind === "app",
    canMove: kind !== "action" && kind !== "page-group",
    canContainChildren: kind === "folder"
  };
}
