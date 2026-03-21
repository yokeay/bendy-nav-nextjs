BEGIN;

CREATE TABLE IF NOT EXISTS card (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200),
  name_en VARCHAR(200) UNIQUE,
  status INTEGER DEFAULT 0,
  version INTEGER DEFAULT 0,
  tips VARCHAR(255),
  create_time TIMESTAMP,
  src TEXT,
  url VARCHAR(255),
  "window" VARCHAR(255),
  update_time TIMESTAMP,
  install_num INTEGER DEFAULT 0,
  setting VARCHAR(200),
  dict_option TEXT
);

CREATE INDEX IF NOT EXISTS card_name_en_index ON card (name_en);

CREATE TABLE IF NOT EXISTS config (
  user_id INTEGER PRIMARY KEY,
  config JSONB
);

CREATE INDEX IF NOT EXISTS config_user_id_index ON config (user_id);

CREATE TABLE IF NOT EXISTS file (
  id BIGSERIAL PRIMARY KEY,
  path VARCHAR(255),
  user_id INTEGER,
  create_time TIMESTAMP,
  size DOUBLE PRECISION DEFAULT 0,
  mime_type VARCHAR(100),
  hash VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS file_hash_index ON file (hash);
CREATE INDEX IF NOT EXISTS file_user_id_index ON file (user_id);

CREATE TABLE IF NOT EXISTS history (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER,
  link JSONB,
  create_time TIMESTAMP
);

CREATE INDEX IF NOT EXISTS history_user_id_index ON history (user_id);

CREATE TABLE IF NOT EXISTS link (
  user_id INTEGER PRIMARY KEY,
  update_time TIMESTAMP,
  link JSONB
);

CREATE TABLE IF NOT EXISTS link_folder (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50),
  sort INTEGER DEFAULT 0,
  group_ids VARCHAR(200) DEFAULT '0'
);

CREATE TABLE IF NOT EXISTS linkstore (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  src VARCHAR(255),
  url TEXT,
  type VARCHAR(20) DEFAULT 'icon',
  size VARCHAR(20) DEFAULT '1x1',
  create_time TIMESTAMP,
  hot BIGINT DEFAULT 0,
  area VARCHAR(20) DEFAULT '',
  tips VARCHAR(255),
  domain VARCHAR(255),
  app INTEGER DEFAULT 0,
  install_num INTEGER DEFAULT 0,
  "bgColor" VARCHAR(30),
  vip INTEGER DEFAULT 0,
  custom JSONB,
  user_id INTEGER,
  status INTEGER DEFAULT 1,
  group_ids VARCHAR(200) DEFAULT '0'
);

CREATE INDEX IF NOT EXISTS linkstore_status_index ON linkstore (status);
CREATE INDEX IF NOT EXISTS linkstore_user_id_index ON linkstore (user_id);

CREATE TABLE IF NOT EXISTS note (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT,
  title VARCHAR(50),
  text TEXT,
  create_time TIMESTAMP,
  update_time TIMESTAMP,
  weight INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS note_user_id_index ON note (user_id);

CREATE TABLE IF NOT EXISTS search_engine (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50),
  icon VARCHAR(255),
  url VARCHAR(255),
  sort INTEGER DEFAULT 0,
  create_time TIMESTAMP,
  status INTEGER DEFAULT 0,
  tips VARCHAR(250)
);

CREATE TABLE IF NOT EXISTS setting (
  keys VARCHAR(200) PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tabbar (
  user_id INTEGER PRIMARY KEY,
  tabs JSONB,
  update_time TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER,
  token TEXT,
  create_time BIGINT,
  ip TEXT,
  user_agent TEXT,
  access_token VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS token_user_id_index ON token (user_id);
CREATE INDEX IF NOT EXISTS token_token_index ON token (token);

CREATE TABLE IF NOT EXISTS "user" (
  id SERIAL PRIMARY KEY,
  avatar VARCHAR(255),
  mail VARCHAR(50),
  password TEXT,
  create_time TIMESTAMP,
  login_ip VARCHAR(100),
  register_ip VARCHAR(100),
  manager INTEGER DEFAULT 0,
  login_fail_count INTEGER DEFAULT 0,
  login_time TIMESTAMP,
  qq_open_id VARCHAR(200),
  wx_open_id VARCHAR(200),
  wx_unionid VARCHAR(200),
  nickname VARCHAR(200),
  status INTEGER DEFAULT 0,
  active DATE,
  group_id BIGINT DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS user_mail_uindex ON "user" (mail);
CREATE UNIQUE INDEX IF NOT EXISTS user_qq_open_id_uindex ON "user" (qq_open_id);
CREATE INDEX IF NOT EXISTS user_wx_open_id_index ON "user" (wx_open_id);
CREATE INDEX IF NOT EXISTS user_wx_unionid_index ON "user" (wx_unionid);

CREATE TABLE IF NOT EXISTS user_search_engine (
  user_id INTEGER PRIMARY KEY,
  list JSONB
);

CREATE TABLE IF NOT EXISTS wallpaper (
  id SERIAL PRIMARY KEY,
  type INTEGER,
  folder INTEGER,
  mime INTEGER DEFAULT 0,
  url TEXT,
  cover TEXT,
  create_time TIMESTAMP,
  name VARCHAR(200),
  sort INTEGER DEFAULT 999
);

CREATE TABLE IF NOT EXISTS user_group (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  create_time TIMESTAMP,
  sort INTEGER DEFAULT 0,
  default_user_group INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plugins_todo (
  id SERIAL PRIMARY KEY,
  status INTEGER DEFAULT 0,
  user_id INTEGER,
  create_time TIMESTAMP,
  expire_time TIMESTAMP,
  todo TEXT,
  weight INTEGER,
  folder VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS plugins_todo_user_id_index ON plugins_todo (user_id);

CREATE TABLE IF NOT EXISTS plugins_todo_folder (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  name VARCHAR(30),
  create_time TIMESTAMP
);

CREATE INDEX IF NOT EXISTS plugins_todo_folder_user_id_index ON plugins_todo_folder (user_id);

CREATE TABLE IF NOT EXISTS ai (
  id BIGSERIAL PRIMARY KEY,
  message TEXT,
  role VARCHAR(100),
  create_time TIMESTAMP,
  dialogue_id BIGINT,
  ai_id VARCHAR(255),
  user_id INTEGER,
  reasoning_content TEXT
);

CREATE INDEX IF NOT EXISTS ai_user_id_index ON ai (user_id);
CREATE INDEX IF NOT EXISTS ai_dialogue_id_index ON ai (dialogue_id);

CREATE TABLE IF NOT EXISTS dialogue (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255),
  create_time TIMESTAMP,
  mode_id INTEGER,
  user_id INTEGER
);

CREATE INDEX IF NOT EXISTS dialogue_user_id_index ON dialogue (user_id);

CREATE TABLE IF NOT EXISTS ai_model (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  tips VARCHAR(255),
  api_host VARCHAR(255),
  sk VARCHAR(255) NOT NULL,
  model VARCHAR(255),
  system_content TEXT,
  create_time TIMESTAMP,
  user_id INTEGER,
  status INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS ai_model_user_id_index ON ai_model (user_id);

COMMIT;
