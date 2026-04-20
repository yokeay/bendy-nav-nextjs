BEGIN;

DELETE FROM card WHERE name_en NOT IN ('weather', 'topSearch', 'calendar');

INSERT INTO card (name, name_en, status, version, tips, src, url, "window")
VALUES
  ('天气', 'weather', 1, 13, '获取您所在地的实时天气', '/plugins/weather/static/ico.png', '/plugins/weather/card', '/plugins/weather/window'),
  ('热搜', 'topSearch', 1, 15, '聚合百度、哔站、微博、知乎、头条等热搜', '/plugins/topSearch/static/ico.png', '/plugins/topSearch/card', '/plugins/topSearch/window'),
  ('日历', 'calendar', 1, 1, '日历', '/plugins/calendar/static/ico.png', '/plugins/calendar/card', '/plugins/calendar/window')
ON CONFLICT (name_en) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  version = EXCLUDED.version,
  tips = EXCLUDED.tips,
  src = EXCLUDED.src,
  url = EXCLUDED.url,
  "window" = EXCLUDED."window";

INSERT INTO linkstore (id, name, src, url, type, size, create_time, hot, tips, domain, app, install_num, status, group_ids)
VALUES
  (1, 'Bilibili', '/static/bilibili.png', 'https://bilibili.com', 'icon', '1x1', '2022-11-07 21:51:42', 0, 'Bilibili 视频站', 'bilibili.com,www.bilibili.com', 0, 0, 1, '0'),
  (2, 'ImgUrl', '/static/imgurl.png', 'https://imgurl.ink', 'icon', '1x1', '2022-11-07 22:05:46', 0, '图床服务', 'imgurl.ink,www.imgurl.ink', 0, 0, 1, '0'),
  (3, '微博', '/static/weibo.png', 'https://weibo.com/', 'icon', '1x1', '2022-11-07 23:37:22', 1, '微博', 'weibo.com,www.weibo.com', 0, 0, 1, '0'),
  (4, '腾讯云', '/static/tencentcloud.png', 'https://cloud.tencent.com/', 'icon', '1x1', '2022-11-10 16:25:51', 1, '腾讯云', 'cloud.tencent.com', 0, 0, 1, '0'),
  (5, '阿里云', '/static/aliyun.svg', 'https://www.aliyun.com/', 'icon', '1x1', '2022-11-10 17:30:17', 1, '阿里云', 'www.aliyun.com,aliyun.com', 0, 0, 1, '0'),
  (6, '腾讯视频', '/static/txsp.png', 'https://v.qq.com/channel/choice?channel_2022=1', 'icon', '1x1', '2022-12-19 19:34:45', 0, '腾讯视频', 'v.qq.com', 0, 0, 1, '0'),
  (7, '记事本', '/static/note.png', '/noteApp', 'icon', '1x1', '2023-06-14 21:13:15', 1, '记事本 App', '/noteApp', 1, 3, 1, '0'),
  (8, 'WebTerm', '/static/webTerm.svg', 'https://ssh.mtab.cc', 'icon', '1x1', '2023-06-14 21:13:15', 1, '在线 SSH 终端', 'ssh.mtab.cc', 1, 3, 1, '0')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  src = EXCLUDED.src,
  url = EXCLUDED.url,
  type = EXCLUDED.type,
  size = EXCLUDED.size,
  create_time = EXCLUDED.create_time,
  hot = EXCLUDED.hot,
  tips = EXCLUDED.tips,
  domain = EXCLUDED.domain,
  app = EXCLUDED.app,
  install_num = EXCLUDED.install_num,
  status = EXCLUDED.status,
  group_ids = EXCLUDED.group_ids;

INSERT INTO search_engine (id, name, icon, url, sort, create_time, status, tips)
VALUES
  (1, '百度', '/static/searchEngine/baidu.svg', 'https://www.baidu.com/s?wd={1}', 0, '2024-01-14 22:12:18', 1, '百度搜索'),
  (3, '必应', '/static/searchEngine/bing.svg', 'https://www.bing.com/search?q={1}', 99, '2024-01-14 23:20:03', 1, '必应搜索'),
  (4, 'Google', '/static/searchEngine/google.svg', 'https://www.google.com/search?q={1}', 98, '2024-01-14 23:20:21', 1, 'Google 搜索'),
  (5, '搜狗', '/static/searchEngine/sougou.svg', 'https://www.sogou.com/web?query={1}', 0, '2024-01-14 23:20:46', 1, '搜狗搜索'),
  (6, '360', '/static/searchEngine/360.svg', 'https://www.so.com/s?q={1}', 0, '2024-01-14 23:21:07', 1, '360 搜索'),
  (7, '开发者搜索', '/static/searchEngine/baidudev.png', 'https://kaifa.baidu.com/searchPage?module=SEARCH&wd={1}', 0, '2024-01-14 23:21:45', 1, '开发者搜索'),
  (8, 'B站', '/static/searchEngine/bilibiliico.png', 'https://search.bilibili.com/all?keyword={1}', 0, '2024-01-14 23:21:57', 1, 'B 站搜索'),
  (9, '微博', '/static/searchEngine/weiboico.png', 'https://s.weibo.com/weibo?q={1}', 0, '2024-01-14 23:22:12', 1, '微博搜索')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  url = EXCLUDED.url,
  sort = EXCLUDED.sort,
  create_time = EXCLUDED.create_time,
  status = EXCLUDED.status,
  tips = EXCLUDED.tips;

INSERT INTO wallpaper (id, type, folder, mime, url, cover, create_time, name, sort)
VALUES
  (1, 1, NULL, 0, NULL, NULL, '2024-02-22 12:29:21', '默认壁纸', 999),
  (2, 0, 1, 0, '/static/wallpaper/wallpaper-1.jpeg', '/static/wallpaper/m_wallpaper-1.jpeg', '2024-02-22 12:35:59', NULL, 999),
  (3, 0, 1, 0, '/static/wallpaper/wallpaper-2.jpeg', '/static/wallpaper/m_wallpaper-2.jpeg', '2024-02-22 12:36:27', NULL, 999),
  (4, 0, 1, 0, '/static/wallpaper/wallpaper-3.jpeg', '/static/wallpaper/m_wallpaper-3.jpeg', '2024-02-22 12:36:43', NULL, 999),
  (5, 0, 1, 0, '/static/wallpaper/wallpaper-4.jpeg', '/static/wallpaper/m_wallpaper-4.jpeg', '2024-02-22 12:36:52', NULL, 999),
  (6, 0, 1, 0, '/static/wallpaper/wallpaper-5.jpeg', '/static/wallpaper/m_wallpaper-5.jpeg', '2024-02-22 12:37:03', NULL, 999)
ON CONFLICT (id) DO UPDATE SET
  type = EXCLUDED.type,
  folder = EXCLUDED.folder,
  mime = EXCLUDED.mime,
  url = EXCLUDED.url,
  cover = EXCLUDED.cover,
  create_time = EXCLUDED.create_time,
  name = EXCLUDED.name,
  sort = EXCLUDED.sort;

COMMIT;
