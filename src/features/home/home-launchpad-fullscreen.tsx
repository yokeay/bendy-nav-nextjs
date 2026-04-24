"use client";

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import styles from "./home-page.module.css";

type LaunchpadLink = {
  id: string;
  name: string;
  url: string;
  icon: string | null;
  bgColor: string | null;
  sort: number;
  categoryId: string | null;
  size: string;
  app: number;
  _type: "link" | "bookmark";
  createdAt?: string;
  tags?: string[];
};

type LaunchpadCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort: number;
  linkCount: number;
  bookmarkCount: number;
};

type LaunchpadResponse = {
  data: {
    query: string;
    categoryId: string;
    sources: {
      links: LaunchpadLink[];
      bookmarks: LaunchpadLink[];
    };
    categories: LaunchpadCategory[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
  code: number;
  message: string;
};

type LaunchpadFullscreenProps = {
  open: boolean;
  onClose: () => void;
};

const DEFAULT_PAGE_SIZE = 24;

// Always call hooks - conditional return at the end
export function LaunchpadFullscreen({ open, onClose }: LaunchpadFullscreenProps): ReactElement {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [items, setItems] = useState<LaunchpadLink[]>([]);
  const [categories, setCategories] = useState<LaunchpadCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  // Don't render if not open - conditional rendering at the end
  const [renderKey, setRenderKey] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Handle escape key and reset when open
  useEffect(() => {
    // Trigger entrance animation after a frame
    requestAnimationFrame(() => setIsVisible(true));
    setMounted(true);

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedCategory("");
      setCurrentPage(1);
      setIsVisible(false);
      setRenderKey((k) => k + 1);
      requestAnimationFrame(() => setIsVisible(true));
    }
  }, [open]);

  const fetchLaunchpadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (selectedCategory) params.set("categoryId", selectedCategory);
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));

      const response = await fetch(`/api/launchpad?${params.toString()}`);
      const result: LaunchpadResponse = await response.json();

      if (result.code === 200 && result.data) {
        const allItems = [
          ...result.data.sources.links,
          ...result.data.sources.bookmarks,
        ].sort((a, b) => {
          if (a.sort === b.sort) return a.id.localeCompare(b.id);
          return a.sort - b.sort;
        });

        setItems(allItems);
        setCategories(result.data.categories);
        setPagination(result.data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch launchpad data:", error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, currentPage, pageSize]);

  useEffect(() => {
    fetchLaunchpadData();
  }, [fetchLaunchpadData]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (currentPage === 1) {
        fetchLaunchpadData();
      } else {
        setCurrentPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleIconClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const renderIcon = (item: LaunchpadLink): ReactNode => {
    const iconStyle: CSSProperties = {
      background: item.bgColor || "rgba(255, 255, 255, 0.12)",
    };

    if (item.icon) {
      if (item.icon.startsWith("http://") || item.icon.startsWith("https://")) {
        return (
          <img
            src={item.icon}
            alt={item.name}
            className={styles.launchpadIconImage}
            loading="lazy"
          />
        );
      }
      return (
        <img
          src={item.icon}
          alt={item.name}
          className={styles.launchpadIconImage}
          loading="lazy"
        />
      );
    }

    return (
      <div className={styles.launchpadIconText} style={iconStyle}>
        {item.name.slice(0, 1).toUpperCase()}
      </div>
    );
  };

  return (
    <div
      className={`${styles.launchpadFullscreenOverlay} ${isVisible ? styles.launchpadFullscreenVisible : ""}`}
      onClick={handleClose}
    >
      <div
        className={styles.launchpadFullscreenContainer}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className={styles.launchpadFullscreenHeader}>
          <div className={styles.launchpadFullscreenTitle}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>启动台</span>
          </div>
          <button
            className={styles.launchpadFullscreenClose}
            onClick={handleClose}
            aria-label="关闭"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* Search */}
        <div className={styles.launchpadFullscreenSearch}>
          <div className={styles.launchpadFullscreenSearchInner}>
            <svg
              className={styles.launchpadFullscreenSearchIcon}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜索所有链接..."
              value={searchQuery}
              onChange={handleSearchChange}
              className={styles.launchpadFullscreenSearchInput}
              autoFocus
            />
            {searchQuery && (
              <button
                className={styles.launchpadFullscreenSearchClear}
                onClick={() => setSearchQuery("")}
                aria-label="清除搜索"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <nav className={styles.launchpadFullscreenTabs}>
          <button
            className={`${styles.launchpadFullscreenTab} ${selectedCategory === "" ? styles.launchpadFullscreenTabActive : ""}`}
            onClick={() => handleCategoryChange("")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            全部
          </button>
          <button
            className={`${styles.launchpadFullscreenTab} ${selectedCategory === "uncategorized" ? styles.launchpadFullscreenTabActive : ""}`}
            onClick={() => handleCategoryChange("uncategorized")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            未分类
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`${styles.launchpadFullscreenTab} ${selectedCategory === cat.id ? styles.launchpadFullscreenTabActive : ""}`}
              onClick={() => handleCategoryChange(cat.id)}
            >
              {cat.icon ? (
                <img src={cat.icon} alt="" width="16" height="16" />
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              )}
              {cat.name}
              <span className={styles.launchpadFullscreenTabBadge}>
                {cat.linkCount + cat.bookmarkCount}
              </span>
            </button>
          ))}
        </nav>

        {/* Grid */}
        <div className={styles.launchpadFullscreenGrid}>
          {loading ? (
            <div className={styles.launchpadFullscreenLoading}>
              <div className={styles.launchpadFullscreenSpinner} />
              <span>加载中...</span>
            </div>
          ) : items.length === 0 ? (
            <div className={styles.launchpadFullscreenEmpty}>
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
                <path d="M8 11h6" />
              </svg>
              <h3>没有找到匹配的链接</h3>
              <p>尝试调整搜索关键词或选择其他分类</p>
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.id}
                className={styles.launchpadFullscreenTile}
                onClick={() => handleIconClick(item.url)}
                style={{ animationDelay: `${Math.min(index * 30, 450)}ms` }}
              >
                <div className={styles.launchpadFullscreenTileIcon}>
                  {renderIcon(item)}
                </div>
                <span className={styles.launchpadFullscreenTileLabel}>
                  {item.name}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <footer className={styles.launchpadFullscreenPagination}>
            <button
              className={styles.launchpadFullscreenPageButton}
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div className={styles.launchpadFullscreenPageNumbers}>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  const distance = Math.abs(page - currentPage);
                  return distance <= 2 || page === 1 || page === pagination.totalPages;
                })
                .map((page, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && page - prev > 1;

                  return (
                    <div key={page} className={styles.launchpadFullscreenPageGroup}>
                      {showEllipsis && (
                        <span className={styles.launchpadFullscreenPageEllipsis}>...</span>
                      )}
                      <button
                        className={`${styles.launchpadFullscreenPageButton} ${currentPage === page ? styles.launchpadFullscreenPageButtonActive : ""}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              className={styles.launchpadFullscreenPageButton}
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= pagination.totalPages}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <span className={styles.launchpadFullscreenPageInfo}>
              {currentPage} / {pagination.totalPages}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}
