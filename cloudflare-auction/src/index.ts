import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { hashPassword, verifyPassword, signSession, verifySession, type SessionData } from "./auth";
import {
  layout, loginView, registerView, indexView, artworkView,
  adminView, reportsView
} from "./views";
import { AuctionRoom } from "./auction-room";

export { AuctionRoom };

export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  AUCTION_ROOM: DurableObjectNamespace;
  SESSION_SECRET: string;
  ADMIN_PASSWORD?: string;
}

type Vars = { user: SessionData | null };
const app = new Hono<{ Bindings: Env; Variables: Vars }>();

const STATIC_CSS = `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", sans-serif; background: #f5f7fa; color: #222; line-height: 1.5; }
a { color: #2563eb; text-decoration: none; } a:hover { text-decoration: underline; }
.navbar { background: white; padding: 14px 28px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 100; }
.brand { font-size: 1.25rem; font-weight: 700; color: #111; }
.nav-links { display: flex; gap: 18px; align-items: center; }
.nav-links a { color: #444; font-weight: 500; }
.nav-links .user-info { background: #eef2ff; color: #4338ca; padding: 4px 12px; border-radius: 999px; font-size: 0.9rem; }
.nav-links .logout { color: #dc2626; }
.container { max-width: 1200px; margin: 0 auto; padding: 28px 20px; }
.flash { padding: 12px 16px; border-radius: 6px; margin-bottom: 18px; font-weight: 500; }
.flash-success { background: #dcfce7; color: #166534; }
.flash-error { background: #fee2e2; color: #991b1b; }
.auth-card { max-width: 400px; margin: 60px auto; background: white; padding: 36px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.auth-card h1 { margin-bottom: 22px; font-size: 1.6rem; }
.auth-foot { margin-top: 18px; font-size: 0.9rem; text-align: center; color: #666; }
.hint { margin-top: 12px; font-size: 0.8rem; color: #888; text-align: center; }
.hint code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
.form { display: flex; flex-direction: column; gap: 14px; }
.form label { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; color: #444; font-weight: 500; }
.form input, .form select, .form textarea { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 1rem; font-family: inherit; }
.form input:focus, .form select:focus, .form textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
.inline-form { flex-direction: row; flex-wrap: wrap; align-items: center; }
.inline-form input { flex: 1; min-width: 150px; }
.grid-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.grid-form .full { grid-column: 1 / -1; }
.btn { padding: 10px 20px; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.15s; }
.btn-primary { background: #2563eb; color: white; } .btn-primary:hover { background: #1d4ed8; }
.btn-sm { padding: 6px 12px; font-size: 0.85rem; }
.btn-green { background: #16a34a; color: white; }
.btn-orange { background: #ea580c; color: white; }
.btn-red { background: #dc2626; color: white; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 14px; }
.page-header h1 { font-size: 1.7rem; }
.quarter-select select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.95rem; background: white; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
.card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.05); transition: transform 0.15s, box-shadow 0.15s; display: block; color: inherit; }
.card:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0,0,0,0.1); text-decoration: none; }
.card-img { position: relative; aspect-ratio: 4/3; background: #f3f4f6; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.card-img img { width: 100%; height: 100%; object-fit: cover; }
.no-img { font-size: 3rem; color: #d1d5db; } .no-img.big { font-size: 6rem; }
.status-badge { position: absolute; top: 10px; right: 10px; padding: 4px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: white; }
.status-badge.big { position: static; display: inline-block; margin-bottom: 12px; font-size: 0.85rem; }
.status-live { background: #fef2f2; color: #dc2626; }
.status-pending { background: #fffbeb; color: #d97706; }
.status-closed { background: #f0f9ff; color: #0369a1; }
.card-body { padding: 14px 16px; }
.card-body h3 { font-size: 1.05rem; margin-bottom: 4px; }
.artist { color: #666; font-size: 0.88rem; margin-bottom: 10px; }
.price-row { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid #f3f4f6; padding-top: 10px; }
.price-label { font-size: 0.8rem; color: #888; }
.price { font-weight: 700; color: #111; font-size: 1.05rem; }
.price small { font-size: 0.7rem; color: #888; font-weight: 400; }
.bid-count { font-size: 0.8rem; color: #888; margin-top: 6px; }
.back-link { display: inline-block; margin-bottom: 18px; color: #666; }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; background: white; padding: 28px; border-radius: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.detail-img { background: #f3f4f6; border-radius: 8px; overflow: hidden; aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center; }
.detail-img img { width: 100%; height: 100%; object-fit: contain; }
.detail-info h1 { font-size: 1.8rem; margin-bottom: 8px; }
.artist-big { color: #444; margin-bottom: 10px; }
.bio { color: #666; font-size: 0.9rem; font-style: italic; margin-bottom: 14px; }
.description { color: #333; margin-bottom: 20px; line-height: 1.7; }
.bid-panel { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
.current-price { margin-bottom: 16px; }
.current-price .label { display: block; font-size: 0.85rem; color: #666; margin-bottom: 4px; }
.current-price .amount { font-size: 1.8rem; font-weight: 800; color: #dc2626; font-variant-numeric: tabular-nums; }
.current-price .amount small { font-size: 0.7rem; color: #888; font-weight: 400; }
.bid-form { display: flex; flex-direction: column; gap: 10px; }
.bid-msg { font-size: 0.9rem; min-height: 1.2em; }
.bid-msg.success { color: #16a34a; } .bid-msg.error { color: #dc2626; }
.winner { font-size: 1.1rem; color: #16a34a; }
.muted { color: #888; }
.bid-history h3 { font-size: 1.05rem; margin-bottom: 12px; color: #444; }
.bid-history ul { list-style: none; max-height: 320px; overflow-y: auto; }
.bid-history li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #f3f4f6; align-items: center; }
.bid-history .bidder { font-weight: 500; }
.bid-history .bid-amount { font-weight: 700; color: #dc2626; font-variant-numeric: tabular-nums; }
.bid-history .bid-time { color: #888; font-size: 0.8rem; }
.bid-history .new-bid { animation: flash-in 1s; }
@keyframes flash-in { from { background: #fef3c7; } to { background: transparent; } }
.admin-section, .report-section { background: white; padding: 24px; border-radius: 12px; margin-bottom: 22px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); }
.admin-section h2, .report-section h2 { margin-bottom: 16px; font-size: 1.2rem; }
.artist-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.chip { background: #eef2ff; color: #4338ca; padding: 4px 12px; border-radius: 999px; font-size: 0.85rem; }
.data-table { width: 100%; border-collapse: collapse; background: white; }
.data-table th, .data-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f3f4f6; }
.data-table th { background: #f9fafb; font-size: 0.85rem; color: #666; font-weight: 600; }
.data-table tbody tr:hover { background: #fafbfc; }
.data-table .actions { display: flex; gap: 6px; }
.empty { background: white; padding: 60px; border-radius: 12px; text-align: center; color: #888; }
@media (max-width: 768px) { .detail-grid { grid-template-columns: 1fr; } .grid-form { grid-template-columns: 1fr; } }`;

const SESSION_COOKIE = "auction_session";

function currentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

async function ensureAdmin(env: Env) {
  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = 'admin'").first();
  if (!existing) {
    const password = env.ADMIN_PASSWORD || "admin1234";
    const hash = await hashPassword(password);
    await env.DB.prepare(
      "INSERT INTO users (username, password_hash, display_name, department, is_admin) VALUES (?, ?, ?, ?, 1)"
    ).bind("admin", hash, "관리자", "원무팀").run();
  }
}

// 모든 요청에서 세션 로드 + 첫 요청 시 admin 보장
app.use("*", async (c, next) => {
  await ensureAdmin(c.env);
  const cookie = getCookie(c, SESSION_COOKIE);
  c.set("user", cookie ? await verifySession(cookie, c.env.SESSION_SECRET) : null);
  await next();
});

const requireUser = (c: any) => c.get("user") as SessionData | null;

// ---------- Static / Misc ----------
app.get("/static/style.css", (c) => {
  return new Response(STATIC_CSS, {
    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
});

app.get("/uploads/:key", async (c) => {
  const obj = await c.env.IMAGES.get(c.req.param("key"));
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

// ---------- Auth ----------
app.get("/login", (c) => c.html(loginView({ id: undefined })));

app.post("/login", async (c) => {
  const form = await c.req.formData();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const row = await c.env.DB.prepare(
    "SELECT id, password_hash, display_name, is_admin FROM users WHERE username = ?"
  ).bind(username).first<{ id: number; password_hash: string; display_name: string; is_admin: number }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.html(loginView({ id: undefined }, "아이디 또는 비밀번호가 올바르지 않습니다."));
  }
  const session: SessionData = {
    user_id: row.id, display_name: row.display_name, is_admin: !!row.is_admin,
  };
  setCookie(c, SESSION_COOKIE, await signSession(session, c.env.SESSION_SECRET), {
    httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 7,
    secure: new URL(c.req.url).protocol === "https:",
  });
  return c.redirect("/");
});

app.get("/register", (c) => c.html(registerView({ id: undefined })));

app.post("/register", async (c) => {
  const form = await c.req.formData();
  const username = String(form.get("username") || "").trim();
  const password = String(form.get("password") || "");
  const display_name = String(form.get("display_name") || "").trim();
  const department = String(form.get("department") || "").trim();
  if (!username || !password || !display_name) {
    return c.html(registerView({ id: undefined }, "필수 항목을 모두 입력하세요."));
  }
  try {
    const hash = await hashPassword(password);
    await c.env.DB.prepare(
      "INSERT INTO users (username, password_hash, display_name, department, is_admin) VALUES (?, ?, ?, ?, 0)"
    ).bind(username, hash, display_name, department).run();
  } catch (e) {
    return c.html(registerView({ id: undefined }, "이미 사용 중인 아이디입니다."));
  }
  return c.redirect("/login");
});

app.get("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/login");
});

// ---------- Index ----------
app.get("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.redirect("/login");
  const quarter = c.req.query("quarter") || currentQuarter();
  const qRows = await c.env.DB.prepare(
    "SELECT DISTINCT quarter FROM artworks ORDER BY quarter DESC"
  ).all<{ quarter: string }>();
  const quarters = qRows.results.map(r => r.quarter);
  const rows = await c.env.DB.prepare(`
    SELECT a.id, a.title, a.status, a.image_key, a.starting_price, ar.name AS artist_name,
           (SELECT MAX(amount) FROM bids WHERE artwork_id = a.id) AS current_bid,
           (SELECT COUNT(*) FROM bids WHERE artwork_id = a.id) AS bid_count
    FROM artworks a JOIN artists ar ON ar.id = a.artist_id
    WHERE a.quarter = ?
    ORDER BY CASE a.status WHEN 'live' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, a.id DESC
  `).bind(quarter).all<any>();
  return c.html(indexView(
    { id: user.user_id, name: user.display_name, is_admin: user.is_admin },
    quarter, quarters, rows.results
  ));
});

// ---------- Artwork detail ----------
app.get("/artwork/:id{[0-9]+}", async (c) => {
  const user = requireUser(c);
  if (!user) return c.redirect("/login");
  const id = parseInt(c.req.param("id"), 10);
  const a = await c.env.DB.prepare(`
    SELECT a.*, ar.name AS artist_name, ar.bio AS artist_bio, u.display_name AS winner_name
    FROM artworks a JOIN artists ar ON ar.id = a.artist_id
    LEFT JOIN users u ON u.id = a.winner_user_id
    WHERE a.id = ?
  `).bind(id).first<any>();
  if (!a) return c.notFound();
  const bidsRes = await c.env.DB.prepare(`
    SELECT b.amount, b.created_at, u.display_name FROM bids b
    JOIN users u ON u.id = b.user_id
    WHERE b.artwork_id = ? ORDER BY b.amount DESC, b.id DESC
  `).bind(id).all<any>();
  const bids = bidsRes.results;
  const currentBid = bids.length ? bids[0].amount : null;
  const minNext = (currentBid ?? (a.starting_price - a.min_increment)) + a.min_increment;
  return c.html(artworkView(
    { id: user.user_id, name: user.display_name, is_admin: user.is_admin },
    a, bids, currentBid, minNext
  ));
});

// ---------- WebSocket ----------
app.get("/ws/artwork/:id{[0-9]+}", (c) => {
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected WebSocket", 426);
  const id = c.req.param("id");
  const stub = c.env.AUCTION_ROOM.get(c.env.AUCTION_ROOM.idFromName(`artwork:${id}`));
  return stub.fetch(new Request("https://do/connect", { headers: c.req.raw.headers }));
});

// ---------- Bid API ----------
app.post("/api/bid", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ ok: false, error: "로그인 필요" }, 401);
  const form = await c.req.formData();
  const artworkId = parseInt(String(form.get("artwork_id") || "0"), 10);
  const amount = parseInt(String(form.get("amount") || "0"), 10);

  const a = await c.env.DB.prepare("SELECT * FROM artworks WHERE id = ?").bind(artworkId).first<any>();
  if (!a) return c.json({ ok: false, error: "작품을 찾을 수 없습니다." }, 404);
  if (a.status !== "live") return c.json({ ok: false, error: "현재 경매 진행 중이 아닙니다." }, 400);

  const top = await c.env.DB.prepare("SELECT MAX(amount) AS m FROM bids WHERE artwork_id = ?")
    .bind(artworkId).first<{ m: number | null }>();
  const current = top?.m ?? (a.starting_price - a.min_increment);
  const minRequired = current + a.min_increment;
  if (amount < minRequired) {
    return c.json({ ok: false, error: `최소 ${minRequired.toLocaleString("ko-KR")}원 이상 입력해야 합니다.` }, 400);
  }
  await c.env.DB.prepare("INSERT INTO bids (artwork_id, user_id, amount) VALUES (?, ?, ?)")
    .bind(artworkId, user.user_id, amount).run();

  const stub = c.env.AUCTION_ROOM.get(c.env.AUCTION_ROOM.idFromName(`artwork:${artworkId}`));
  c.executionCtx.waitUntil(stub.fetch(new Request("https://do/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "bid_update",
      artwork_id: artworkId,
      amount,
      bidder: user.display_name,
      time: new Date().toLocaleTimeString("ko-KR", { hour12: false }),
    }),
  })));

  return c.json({ ok: true, amount, min_next: amount + a.min_increment });
});

// ---------- Admin ----------
const adminGuard = (user: SessionData | null) => user && user.is_admin;

app.get("/admin", async (c) => {
  const user = requireUser(c);
  if (!user) return c.redirect("/login");
  if (!adminGuard(user)) return c.text("권한 없음", 403);
  const artists = (await c.env.DB.prepare("SELECT id, name, department FROM artists ORDER BY name").all<any>()).results;
  const artworks = (await c.env.DB.prepare(`
    SELECT a.id, a.title, a.quarter, a.starting_price, a.status, a.winning_price, ar.name AS artist_name
    FROM artworks a JOIN artists ar ON ar.id = a.artist_id ORDER BY a.id DESC
  `).all<any>()).results;
  return c.html(adminView(
    { id: user.user_id, name: user.display_name, is_admin: user.is_admin },
    artists, artworks, currentQuarter()
  ));
});

app.post("/admin/artist", async (c) => {
  const user = requireUser(c);
  if (!adminGuard(user)) return c.text("권한 없음", 403);
  const form = await c.req.formData();
  const name = String(form.get("name") || "").trim();
  const department = String(form.get("department") || "").trim();
  const bio = String(form.get("bio") || "").trim();
  if (!name) return c.redirect("/admin");
  await c.env.DB.prepare("INSERT INTO artists (name, department, bio) VALUES (?, ?, ?)")
    .bind(name, department, bio).run();
  return c.redirect("/admin");
});

app.post("/admin/artwork", async (c) => {
  const user = requireUser(c);
  if (!adminGuard(user)) return c.text("권한 없음", 403);
  const form = await c.req.formData();
  const artistId = parseInt(String(form.get("artist_id") || "0"), 10);
  const title = String(form.get("title") || "").trim();
  const description = String(form.get("description") || "").trim();
  const starting_price = parseInt(String(form.get("starting_price") || "10000"), 10);
  const min_increment = parseInt(String(form.get("min_increment") || "1000"), 10);
  const quarter = String(form.get("quarter") || currentQuarter()).trim();

  let imageKey: string | null = null;
  const image = form.get("image") as unknown as
    { name: string; type: string; size: number; stream: () => ReadableStream } | string | null;
  if (image && typeof image !== "string" && image.size > 0) {
    const ext = (image.name.split(".").pop() || "jpg").toLowerCase();
    imageKey = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    await c.env.IMAGES.put(imageKey, image.stream(), {
      httpMetadata: { contentType: image.type || "image/jpeg" },
    });
  }
  if (!title || !artistId) return c.redirect("/admin");
  await c.env.DB.prepare(`
    INSERT INTO artworks (artist_id, title, description, image_key, starting_price, min_increment, quarter)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(artistId, title, description, imageKey, starting_price, min_increment, quarter).run();
  return c.redirect("/admin");
});

app.post("/admin/artwork/:id{[0-9]+}/start", async (c) => {
  const user = requireUser(c);
  if (!adminGuard(user)) return c.text("권한 없음", 403);
  const id = parseInt(c.req.param("id"), 10);
  await c.env.DB.prepare(
    "UPDATE artworks SET status = 'live', starts_at = datetime('now') WHERE id = ? AND status = 'pending'"
  ).bind(id).run();
  const stub = c.env.AUCTION_ROOM.get(c.env.AUCTION_ROOM.idFromName(`artwork:${id}`));
  c.executionCtx.waitUntil(stub.fetch(new Request("https://do/broadcast", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "auction_started", artwork_id: id }),
  })));
  return c.redirect("/admin");
});

app.post("/admin/artwork/:id{[0-9]+}/close", async (c) => {
  const user = requireUser(c);
  if (!adminGuard(user)) return c.text("권한 없음", 403);
  const id = parseInt(c.req.param("id"), 10);
  const top = await c.env.DB.prepare(
    "SELECT user_id, amount FROM bids WHERE artwork_id = ? ORDER BY amount DESC, id DESC LIMIT 1"
  ).bind(id).first<{ user_id: number; amount: number }>();
  if (top) {
    await c.env.DB.prepare(`
      UPDATE artworks SET status = 'closed', ends_at = datetime('now'),
             winner_user_id = ?, winning_price = ? WHERE id = ?
    `).bind(top.user_id, top.amount, id).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE artworks SET status = 'closed', ends_at = datetime('now') WHERE id = ?"
    ).bind(id).run();
  }
  const stub = c.env.AUCTION_ROOM.get(c.env.AUCTION_ROOM.idFromName(`artwork:${id}`));
  c.executionCtx.waitUntil(stub.fetch(new Request("https://do/broadcast", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "auction_closed", artwork_id: id }),
  })));
  return c.redirect("/admin");
});

app.post("/admin/artwork/:id{[0-9]+}/delete", async (c) => {
  const user = requireUser(c);
  if (!adminGuard(user)) return c.text("권한 없음", 403);
  const id = parseInt(c.req.param("id"), 10);
  const a = await c.env.DB.prepare("SELECT image_key FROM artworks WHERE id = ?").bind(id).first<{ image_key: string | null }>();
  if (a?.image_key) await c.env.IMAGES.delete(a.image_key);
  await c.env.DB.prepare("DELETE FROM artworks WHERE id = ?").bind(id).run();
  return c.redirect("/admin");
});

// ---------- Reports ----------
app.get("/reports", async (c) => {
  const user = requireUser(c);
  if (!user) return c.redirect("/login");
  const quarterly = (await c.env.DB.prepare(`
    SELECT quarter, COUNT(*) AS total,
           SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS sold,
           COALESCE(SUM(winning_price), 0) AS revenue
    FROM artworks GROUP BY quarter ORDER BY quarter DESC
  `).all<any>()).results;
  const byArtist = (await c.env.DB.prepare(`
    SELECT ar.name AS artist_name, COUNT(a.id) AS works,
           SUM(CASE WHEN a.status='closed' THEN 1 ELSE 0 END) AS sold,
           COALESCE(SUM(a.winning_price), 0) AS revenue
    FROM artists ar LEFT JOIN artworks a ON a.artist_id = ar.id
    GROUP BY ar.id ORDER BY revenue DESC
  `).all<any>()).results;
  const topBidders = (await c.env.DB.prepare(`
    SELECT u.display_name, u.department,
           COUNT(DISTINCT a.id) AS won_count,
           COALESCE(SUM(a.winning_price), 0) AS spent
    FROM users u LEFT JOIN artworks a ON a.winner_user_id = u.id
    WHERE a.status = 'closed'
    GROUP BY u.id ORDER BY spent DESC LIMIT 10
  `).all<any>()).results;
  const recent = (await c.env.DB.prepare(`
    SELECT a.title, a.winning_price, a.quarter, a.ends_at,
           ar.name AS artist_name, u.display_name AS winner
    FROM artworks a JOIN artists ar ON ar.id = a.artist_id
    LEFT JOIN users u ON u.id = a.winner_user_id
    WHERE a.status = 'closed' ORDER BY a.ends_at DESC LIMIT 20
  `).all<any>()).results;
  return c.html(reportsView(
    { id: user.user_id, name: user.display_name, is_admin: user.is_admin },
    quarterly, byArtist, topBidders, recent
  ));
});

app.notFound((c) => c.text("Not Found", 404));

export default app;
