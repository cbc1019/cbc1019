-- 병원 그림 경매 D1 스키마
DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS artworks;
DROP TABLE IF EXISTS artists;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  department TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT,
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE artworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_key TEXT,
  starting_price INTEGER NOT NULL DEFAULT 10000,
  min_increment INTEGER NOT NULL DEFAULT 1000,
  quarter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | live | closed
  starts_at TEXT,
  ends_at TEXT,
  winner_user_id INTEGER REFERENCES users(id),
  winning_price INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  artwork_id INTEGER NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bids_artwork ON bids(artwork_id);
CREATE INDEX idx_artworks_status ON artworks(status);
CREATE INDEX idx_artworks_quarter ON artworks(quarter);

-- 초기 관리자(admin/admin1234) - 코드에서 첫 부팅 시 PBKDF2로 자동 생성됨
