"""
병원 그림 경매 시스템 (Hospital Art Auction)
- 분기별 작품 등록 및 실시간 영국식 경매
- 직원 로그인/입찰, 관리자 작품·작가 관리, 낙찰 통계
"""
import os
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import (
    Flask, render_template, request, redirect, url_for,
    flash, session, jsonify, send_from_directory, abort
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "art_auction.db"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_EXT = {"png", "jpg", "jpeg", "gif", "webp"}

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-me-in-production-xyz")
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")


# ---------- DB ----------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    with get_db() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            department TEXT,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department TEXT,
            bio TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS artworks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artist_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            image_path TEXT,
            starting_price INTEGER NOT NULL DEFAULT 10000,
            min_increment INTEGER NOT NULL DEFAULT 1000,
            quarter TEXT NOT NULL,            -- e.g. "2026-Q2"
            status TEXT NOT NULL DEFAULT 'pending', -- pending | live | closed
            starts_at TEXT,
            ends_at TEXT,
            winner_user_id INTEGER,
            winning_price INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
            FOREIGN KEY (winner_user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS bids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            artwork_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_bids_artwork ON bids(artwork_id);
        CREATE INDEX IF NOT EXISTS idx_artworks_status ON artworks(status);
        """)

        # 기본 관리자 계정
        admin = db.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
        if not admin:
            db.execute(
                "INSERT INTO users (username, password_hash, display_name, department, is_admin, created_at) "
                "VALUES (?, ?, ?, ?, 1, ?)",
                ("admin", generate_password_hash("admin1234"), "관리자", "원무팀", now_iso()),
            )
            db.commit()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def current_quarter():
    today = datetime.now()
    q = (today.month - 1) // 3 + 1
    return f"{today.year}-Q{q}"


# ---------- Auth helpers ----------
def login_required(f):
    @wraps(f)
    def wrap(*a, **kw):
        if "user_id" not in session:
            return redirect(url_for("login", next=request.path))
        return f(*a, **kw)
    return wrap


def admin_required(f):
    @wraps(f)
    @login_required
    def wrap(*a, **kw):
        if not session.get("is_admin"):
            abort(403)
        return f(*a, **kw)
    return wrap


@app.context_processor
def inject_user():
    return dict(
        current_user={
            "id": session.get("user_id"),
            "name": session.get("display_name"),
            "is_admin": session.get("is_admin", False),
        }
    )


# ---------- Routes: Auth ----------
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        with get_db() as db:
            user = db.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["display_name"] = user["display_name"]
            session["is_admin"] = bool(user["is_admin"])
            return redirect(request.args.get("next") or url_for("index"))
        flash("아이디 또는 비밀번호가 올바르지 않습니다.", "error")
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        display_name = request.form.get("display_name", "").strip()
        department = request.form.get("department", "").strip()
        if not username or not password or not display_name:
            flash("필수 항목을 모두 입력하세요.", "error")
            return render_template("register.html")
        try:
            with get_db() as db:
                db.execute(
                    "INSERT INTO users (username, password_hash, display_name, department, is_admin, created_at) "
                    "VALUES (?, ?, ?, ?, 0, ?)",
                    (username, generate_password_hash(password), display_name, department, now_iso()),
                )
                db.commit()
        except sqlite3.IntegrityError:
            flash("이미 사용 중인 아이디입니다.", "error")
            return render_template("register.html")
        flash("가입이 완료되었습니다. 로그인해주세요.", "success")
        return redirect(url_for("login"))
    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------- Routes: Auctions ----------
@app.route("/")
@login_required
def index():
    quarter = request.args.get("quarter", current_quarter())
    with get_db() as db:
        quarters = [r["quarter"] for r in db.execute(
            "SELECT DISTINCT quarter FROM artworks ORDER BY quarter DESC"
        ).fetchall()]
        artworks = db.execute("""
            SELECT a.*, ar.name AS artist_name,
                   (SELECT MAX(amount) FROM bids WHERE artwork_id = a.id) AS current_bid,
                   (SELECT COUNT(*) FROM bids WHERE artwork_id = a.id) AS bid_count
            FROM artworks a JOIN artists ar ON ar.id = a.artist_id
            WHERE a.quarter = ?
            ORDER BY CASE a.status WHEN 'live' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, a.id DESC
        """, (quarter,)).fetchall()
    return render_template("index.html", artworks=artworks, quarter=quarter,
                           quarters=quarters, current_q=current_quarter())


@app.route("/artwork/<int:artwork_id>")
@login_required
def artwork_detail(artwork_id):
    with get_db() as db:
        artwork = db.execute("""
            SELECT a.*, ar.name AS artist_name, ar.bio AS artist_bio,
                   u.display_name AS winner_name
            FROM artworks a
            JOIN artists ar ON ar.id = a.artist_id
            LEFT JOIN users u ON u.id = a.winner_user_id
            WHERE a.id = ?
        """, (artwork_id,)).fetchone()
        if not artwork:
            abort(404)
        bids = db.execute("""
            SELECT b.*, u.display_name FROM bids b
            JOIN users u ON u.id = b.user_id
            WHERE b.artwork_id = ? ORDER BY b.amount DESC, b.id DESC
        """, (artwork_id,)).fetchall()
    current_bid = bids[0]["amount"] if bids else None
    min_next = (current_bid or artwork["starting_price"] - artwork["min_increment"]) + artwork["min_increment"]
    return render_template("artwork.html", artwork=artwork, bids=bids,
                           current_bid=current_bid, min_next=min_next)


@app.route("/api/bid", methods=["POST"])
@login_required
def api_bid():
    artwork_id = int(request.form.get("artwork_id", 0))
    amount = int(request.form.get("amount", 0))
    user_id = session["user_id"]

    with get_db() as db:
        artwork = db.execute("SELECT * FROM artworks WHERE id = ?", (artwork_id,)).fetchone()
        if not artwork:
            return jsonify(ok=False, error="작품을 찾을 수 없습니다."), 404
        if artwork["status"] != "live":
            return jsonify(ok=False, error="현재 경매 진행 중이 아닙니다."), 400

        top = db.execute(
            "SELECT MAX(amount) AS m FROM bids WHERE artwork_id = ?", (artwork_id,)
        ).fetchone()
        current = top["m"] or (artwork["starting_price"] - artwork["min_increment"])
        min_required = current + artwork["min_increment"]
        if amount < min_required:
            return jsonify(ok=False, error=f"최소 {min_required:,}원 이상 입력해야 합니다."), 400

        db.execute(
            "INSERT INTO bids (artwork_id, user_id, amount, created_at) VALUES (?, ?, ?, ?)",
            (artwork_id, user_id, amount, now_iso()),
        )
        db.commit()

    # 실시간 브로드캐스트
    socketio.emit("bid_update", {
        "artwork_id": artwork_id,
        "amount": amount,
        "bidder": session.get("display_name"),
        "time": datetime.now().strftime("%H:%M:%S"),
    }, room=f"artwork_{artwork_id}")

    return jsonify(ok=True, amount=amount,
                   min_next=amount + artwork["min_increment"])


# ---------- Routes: Admin ----------
@app.route("/admin")
@admin_required
def admin_dashboard():
    with get_db() as db:
        artists = db.execute("SELECT * FROM artists ORDER BY name").fetchall()
        artworks = db.execute("""
            SELECT a.*, ar.name AS artist_name
            FROM artworks a JOIN artists ar ON ar.id = a.artist_id
            ORDER BY a.id DESC
        """).fetchall()
    return render_template("admin.html", artists=artists, artworks=artworks,
                           current_q=current_quarter())


@app.route("/admin/artist", methods=["POST"])
@admin_required
def admin_add_artist():
    name = request.form.get("name", "").strip()
    department = request.form.get("department", "").strip()
    bio = request.form.get("bio", "").strip()
    if not name:
        flash("작가 이름은 필수입니다.", "error")
        return redirect(url_for("admin_dashboard"))
    with get_db() as db:
        db.execute(
            "INSERT INTO artists (name, department, bio, created_at) VALUES (?, ?, ?, ?)",
            (name, department, bio, now_iso()),
        )
        db.commit()
    flash(f"작가 '{name}'이(가) 등록되었습니다.", "success")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/artwork", methods=["POST"])
@admin_required
def admin_add_artwork():
    artist_id = int(request.form.get("artist_id", 0))
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    starting_price = int(request.form.get("starting_price", 10000) or 10000)
    min_increment = int(request.form.get("min_increment", 1000) or 1000)
    quarter = request.form.get("quarter", current_quarter()).strip()

    image_path = None
    file = request.files.get("image")
    if file and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXT:
            flash("지원하지 않는 이미지 형식입니다.", "error")
            return redirect(url_for("admin_dashboard"))
        fname = f"{int(datetime.now().timestamp())}_{secure_filename(file.filename)}"
        file.save(UPLOAD_DIR / fname)
        image_path = f"uploads/{fname}"

    if not title or not artist_id:
        flash("작품명과 작가는 필수입니다.", "error")
        return redirect(url_for("admin_dashboard"))

    with get_db() as db:
        db.execute("""
            INSERT INTO artworks (artist_id, title, description, image_path,
                                  starting_price, min_increment, quarter, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (artist_id, title, description, image_path,
              starting_price, min_increment, quarter, now_iso()))
        db.commit()
    flash(f"작품 '{title}'이(가) 등록되었습니다.", "success")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/artwork/<int:artwork_id>/start", methods=["POST"])
@admin_required
def admin_start(artwork_id):
    with get_db() as db:
        db.execute(
            "UPDATE artworks SET status = 'live', starts_at = ? WHERE id = ? AND status = 'pending'",
            (now_iso(), artwork_id),
        )
        db.commit()
    socketio.emit("auction_started", {"artwork_id": artwork_id}, room=f"artwork_{artwork_id}")
    flash("경매가 시작되었습니다.", "success")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/artwork/<int:artwork_id>/close", methods=["POST"])
@admin_required
def admin_close(artwork_id):
    with get_db() as db:
        top = db.execute("""
            SELECT user_id, amount FROM bids
            WHERE artwork_id = ? ORDER BY amount DESC, id DESC LIMIT 1
        """, (artwork_id,)).fetchone()
        if top:
            db.execute("""
                UPDATE artworks SET status = 'closed', ends_at = ?,
                       winner_user_id = ?, winning_price = ?
                WHERE id = ?
            """, (now_iso(), top["user_id"], top["amount"], artwork_id))
        else:
            db.execute(
                "UPDATE artworks SET status = 'closed', ends_at = ? WHERE id = ?",
                (now_iso(), artwork_id),
            )
        db.commit()
    socketio.emit("auction_closed", {"artwork_id": artwork_id}, room=f"artwork_{artwork_id}")
    flash("경매가 마감되었습니다.", "success")
    return redirect(url_for("admin_dashboard"))


@app.route("/admin/artwork/<int:artwork_id>/delete", methods=["POST"])
@admin_required
def admin_delete(artwork_id):
    with get_db() as db:
        db.execute("DELETE FROM artworks WHERE id = ?", (artwork_id,))
        db.commit()
    flash("작품이 삭제되었습니다.", "success")
    return redirect(url_for("admin_dashboard"))


# ---------- Reports ----------
@app.route("/reports")
@login_required
def reports():
    with get_db() as db:
        quarterly = db.execute("""
            SELECT quarter,
                   COUNT(*) AS total,
                   SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) AS sold,
                   COALESCE(SUM(winning_price), 0) AS revenue
            FROM artworks GROUP BY quarter ORDER BY quarter DESC
        """).fetchall()
        by_artist = db.execute("""
            SELECT ar.name AS artist_name,
                   COUNT(a.id) AS works,
                   SUM(CASE WHEN a.status='closed' THEN 1 ELSE 0 END) AS sold,
                   COALESCE(SUM(a.winning_price), 0) AS revenue
            FROM artists ar LEFT JOIN artworks a ON a.artist_id = ar.id
            GROUP BY ar.id ORDER BY revenue DESC
        """).fetchall()
        top_bidders = db.execute("""
            SELECT u.display_name, u.department,
                   COUNT(DISTINCT a.id) AS won_count,
                   COALESCE(SUM(a.winning_price), 0) AS spent
            FROM users u LEFT JOIN artworks a ON a.winner_user_id = u.id
            WHERE a.status = 'closed'
            GROUP BY u.id ORDER BY spent DESC LIMIT 10
        """).fetchall()
        recent_sold = db.execute("""
            SELECT a.title, a.winning_price, a.quarter, a.ends_at,
                   ar.name AS artist_name, u.display_name AS winner
            FROM artworks a
            JOIN artists ar ON ar.id = a.artist_id
            LEFT JOIN users u ON u.id = a.winner_user_id
            WHERE a.status = 'closed'
            ORDER BY a.ends_at DESC LIMIT 20
        """).fetchall()
    return render_template("reports.html", quarterly=quarterly, by_artist=by_artist,
                           top_bidders=top_bidders, recent_sold=recent_sold)


# ---------- SocketIO ----------
@socketio.on("join_artwork")
def on_join(data):
    artwork_id = data.get("artwork_id")
    if artwork_id:
        join_room(f"artwork_{artwork_id}")


@socketio.on("leave_artwork")
def on_leave(data):
    artwork_id = data.get("artwork_id")
    if artwork_id:
        leave_room(f"artwork_{artwork_id}")


# ---------- Misc ----------
@app.route("/uploads/<path:fname>")
def uploads(fname):
    return send_from_directory(UPLOAD_DIR, fname)


@app.errorhandler(403)
def forbidden(e):
    return "권한이 없습니다.", 403


@app.template_filter("krw")
def krw(value):
    if value is None:
        return "-"
    return f"{int(value):,}원"


if __name__ == "__main__":
    init_db()
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
