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

type LaunchpadPanelProps = {
  onClose?: () => void;
};

const DEFAULT_PAGE_SIZE = 24;

export function LaunchpadPanel({ onClose }: LaunchpadPanelProps): ReactElement {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);
  const [items, setItems] = useState<LaunchpadLink[]>([]);
  const [categories, setCategories] = useState<LaunchpadCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

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
      <div
        className={styles.launchpadIconText}
        style={iconStyle}
      >
        {item.name.slice(0, 1).toUpperCase()}
      </div>
    );
  };

  return (
    <div className={styles.launchpadContainer}>
      <div className={styles.launchpadHeader}>
        <div className={styles.launchpadSearch}>
          <svg
            className={styles.launchpadSearchIcon}
            width="16"
            height="16"
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
            className={styles.launchpadSearchInput}
          />
        </div>
      </div>

      <div className={styles.launchpadCategoryTabs}>
        <button
          className={`${styles.launchpadCategoryTab} ${selectedCategory === "" ? styles.launchpadCategoryTabActive : ""}`}
          onClick={() => handleCategoryChange("")}
        >
          全部
        </button>
        <button
          className={`${styles.launchpadCategoryTab} ${selectedCategory === "uncategorized" ? styles.launchpadCategoryTabActive : ""}`}
          onClick={() => handleCategoryChange("uncategorized")}
        >
          未分类
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`${styles.launchpadCategoryTab} ${selectedCategory === cat.id ? styles.launchpadCategoryTabActive : ""}`}
            onClick={() => handleCategoryChange(cat.id)}
          >
            {cat.name}
            <span className={styles.launchpadCategoryCount}>
              {cat.linkCount + cat.bookmarkCount}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.launchpadGrid}>
        {loading ? (
          <div className={styles.launchpadLoading}>
            <div className={styles.launchpadSpinner} />
          </div>
        ) : items.length === 0 ? (
          <div className={styles.launchpadEmpty}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <p>没有找到匹配的链接</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              className={styles.launchpadTile}
              onClick={() => handleIconClick(item.url)}
            >
              <div className={styles.launchpadTileIcon}>
                {renderIcon(item)}
              </div>
              <span className={styles.launchpadTileLabel}>
                {item.name}
              </span>
            </button>
          ))
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className={styles.launchpadPagination}>
          <button
            className={styles.launchpadPageButton}
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <svg
              width="16"
              height="16"
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

          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
            .filter((page) => {
              const distance = Math.abs(page - currentPage);
              return distance <= 2 || page === 1 || page === pagination.totalPages;
            })
            .map((page, idx, arr) => {
              const prev = arr[idx - 1];
              const showEllipsis = prev && page - prev > 1;

              return (
                <div key={page} className={styles.launchpadPageGroup}>
                  {showEllipsis && (
                    <span className={styles.launchpadPageEllipsis}>...</span>
                  )}
                  <button
                    className={`${styles.launchpadPageButton} ${currentPage === page ? styles.launchpadPageButtonActive : ""}`}
                    onClick={() => handlePageChange(page)}
                  >
                    {page}
                  </button>
                </div>
              );
            })}

          <button
            className={styles.launchpadPageButton}
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= pagination.totalPages}
          >
            <svg
              width="16"
              height="16"
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

          <span className={styles.launchpadPageInfo}>
            {currentPage} / {pagination.totalPages}
          </span>
        </div>
      )}
    </div>
  );
}
