// HTML 렌더링 헬퍼 (의존성 없는 템플릿 함수)
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

type Renderable = HtmlEscapedString | Promise<HtmlEscapedString> | string;

export const krw = (v: number | null | undefined) =>
  v == null ? "-" : `${Number(v).toLocaleString("ko-KR")}원`;

export interface CurrentUser {
  id?: number;
  name?: string;
  is_admin?: boolean;
}

export const layout = (
  title: string,
  user: CurrentUser,
  body: Renderable,
  scripts: Renderable = "",
  flash: { type: "success" | "error"; msg: string } | null = null,
) => html`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<nav class="navbar">
  <a href="/" class="brand">🎨 병원 그림 경매</a>
  <div class="nav-links">
    ${user.id ? html`
      <a href="/">경매 목록</a>
      <a href="/reports">통계</a>
      ${user.is_admin ? html`<a href="/admin">관리</a>` : ""}
      <span class="user-info">${user.name}</span>
      <a href="/logout" class="logout">로그아웃</a>
    ` : html`
      <a href="/login">로그인</a>
      <a href="/register">가입</a>
    `}
  </div>
</nav>
<main class="container">
  ${flash ? html`<div class="flash flash-${flash.type}">${flash.msg}</div>` : ""}
  ${body}
</main>
${scripts}
</body>
</html>`;

export const loginView = (user: CurrentUser, error?: string) =>
  layout("로그인", user, html`
    <div class="auth-card">
      <h1>로그인</h1>
      <form method="post" class="form">
        <label>아이디 <input name="username" required autofocus></label>
        <label>비밀번호 <input type="password" name="password" required></label>
        <button type="submit" class="btn btn-primary">로그인</button>
      </form>
      <p class="auth-foot">계정이 없으신가요? <a href="/register">직원 가입</a></p>
      <p class="hint">기본 관리자: <code>admin</code> / <code>admin1234</code></p>
    </div>
  `, "", error ? { type: "error", msg: error } : null);

export const registerView = (user: CurrentUser, error?: string) =>
  layout("직원 가입", user, html`
    <div class="auth-card">
      <h1>직원 가입</h1>
      <form method="post" class="form">
        <label>아이디 <input name="username" required></label>
        <label>비밀번호 <input type="password" name="password" required minlength="4"></label>
        <label>이름 <input name="display_name" required></label>
        <label>부서 <input name="department" placeholder="예: 내과, 간호3팀"></label>
        <button type="submit" class="btn btn-primary">가입하기</button>
      </form>
      <p class="auth-foot"><a href="/login">로그인으로 돌아가기</a></p>
    </div>
  `, "", error ? { type: "error", msg: error } : null);

interface ArtworkRow {
  id: number; title: string; status: string; artist_name: string;
  image_key: string | null; starting_price: number; current_bid: number | null;
  bid_count: number;
}

export const indexView = (user: CurrentUser, quarter: string, quarters: string[], artworks: ArtworkRow[]) => {
  const allQ = quarters.includes(quarter) ? quarters : [quarter, ...quarters];
  return layout("경매 작품 목록", user, html`
    <div class="page-header">
      <h1>${quarter} 분기 경매 작품</h1>
      <form method="get" class="quarter-select">
        <label>분기 선택:
          <select name="quarter" onchange="this.form.submit()">
            ${raw(allQ.map(q => `<option value="${q}" ${q === quarter ? "selected" : ""}>${q}</option>`).join(""))}
          </select>
        </label>
      </form>
    </div>
    ${artworks.length ? html`
      <div class="grid">
        ${raw(artworks.map(a => `
          <a href="/artwork/${a.id}" class="card">
            <div class="card-img">
              ${a.image_key ? `<img src="/uploads/${a.image_key}" alt="">` : `<div class="no-img">🖼️</div>`}
              <span class="status-badge status-${a.status}">${
                a.status === "live" ? "🔴 진행중" :
                a.status === "pending" ? "⏳ 시작 전" : "✅ 마감"
              }</span>
            </div>
            <div class="card-body">
              <h3>${escapeHtml(a.title)}</h3>
              <p class="artist">${escapeHtml(a.artist_name)}</p>
              <div class="price-row">
                <span class="price-label">${a.status === "closed" ? "낙찰가" : "현재가"}</span>
                <span class="price">${
                  a.current_bid ? krw(a.current_bid) :
                  `${krw(a.starting_price)} <small>(시작가)</small>`
                }</span>
              </div>
              <p class="bid-count">입찰 ${a.bid_count}회</p>
            </div>
          </a>
        `).join(""))}
      </div>
    ` : html`<div class="empty"><p>이번 분기에 등록된 작품이 없습니다.</p></div>`}
  `);
};

interface ArtworkDetail {
  id: number; title: string; description: string | null; image_key: string | null;
  starting_price: number; min_increment: number; quarter: string; status: string;
  artist_name: string; artist_bio: string | null;
  winner_name: string | null; winning_price: number | null;
}

interface BidRow { display_name: string; amount: number; created_at: string; }

export const artworkView = (
  user: CurrentUser, a: ArtworkDetail, bids: BidRow[],
  currentBid: number | null, minNext: number
) => {
  const bidsHtml = bids.map(b => `
    <li>
      <span class="bidder">${escapeHtml(b.display_name)}</span>
      <span class="bid-amount">${krw(b.amount)}</span>
      <span class="bid-time">${b.created_at.replace("T", " ").slice(0, 19)}</span>
    </li>
  `).join("");

  return layout(a.title, user, html`
    <a href="/?quarter=${a.quarter}" class="back-link">← 목록으로</a>
    <div class="detail-grid">
      <div class="detail-img">
        ${a.image_key ? html`<img src="/uploads/${a.image_key}" alt="">` : html`<div class="no-img big">🖼️</div>`}
      </div>
      <div class="detail-info">
        <span class="status-badge status-${a.status} big">${
          a.status === "live" ? "🔴 진행중" :
          a.status === "pending" ? "⏳ 시작 전" : "✅ 마감"
        }</span>
        <h1>${a.title}</h1>
        <p class="artist-big">작가: <strong>${a.artist_name}</strong></p>
        ${a.artist_bio ? html`<p class="bio">${a.artist_bio}</p>` : ""}
        ${a.description ? html`<p class="description">${a.description}</p>` : ""}

        <div class="bid-panel">
          <div class="current-price">
            <span class="label">${a.status === "closed" ? "최종 낙찰가" : "현재 최고가"}</span>
            <span class="amount" id="current-amount">
              ${currentBid ? krw(currentBid) : raw(`${krw(a.starting_price)} <small>(시작가)</small>`)}
            </span>
          </div>
          ${a.status === "live" ? html`
            <form id="bid-form" class="bid-form">
              <input type="hidden" name="artwork_id" value="${a.id}">
              <label>입찰가 (최소 ${krw(minNext)})
                <input type="number" name="amount" id="bid-amount" min="${minNext}"
                       step="${a.min_increment}" value="${minNext}" required>
              </label>
              <button type="submit" class="btn btn-primary">입찰하기</button>
              <p id="bid-msg" class="bid-msg"></p>
            </form>
          ` : a.status === "pending" ? html`
            <p class="muted">아직 경매가 시작되지 않았습니다.</p>
          ` : a.winner_name ? html`
            <p class="winner">🏆 낙찰자: <strong>${a.winner_name}</strong></p>
          ` : html`<p class="muted">유찰되었습니다.</p>`}
        </div>

        <div class="bid-history">
          <h3>입찰 기록 <span id="bid-count">(${bids.length}건)</span></h3>
          <ul id="bid-list">${raw(bidsHtml)}</ul>
        </div>
      </div>
    </div>
  `, html`
    <script>
      const ARTWORK_ID = ${a.id};
      const MIN_INC = ${a.min_increment};
      const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(\`\${wsProto}//\${location.host}/ws/artwork/${a.id}\`);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'auction_closed') { location.reload(); return; }
        if (data.type !== 'bid_update' || data.artwork_id !== ARTWORK_ID) return;
        document.getElementById('current-amount').textContent = data.amount.toLocaleString('ko-KR') + '원';
        const list = document.getElementById('bid-list');
        const li = document.createElement('li');
        li.innerHTML = '<span class="bidder">' + data.bidder + '</span>'
          + '<span class="bid-amount">' + data.amount.toLocaleString('ko-KR') + '원</span>'
          + '<span class="bid-time">' + data.time + '</span>';
        li.classList.add('new-bid');
        list.prepend(li);
        document.getElementById('bid-count').textContent = '(' + list.children.length + '건)';
        const amt = document.getElementById('bid-amount');
        if (amt) { amt.min = data.amount + MIN_INC; amt.value = data.amount + MIN_INC; }
      };

      const form = document.getElementById('bid-form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const msg = document.getElementById('bid-msg');
          msg.textContent = '입찰 중...'; msg.className = 'bid-msg';
          const fd = new FormData(form);
          const res = await fetch('/api/bid', {method: 'POST', body: fd});
          const data = await res.json();
          if (data.ok) { msg.textContent = '✅ 입찰 완료!'; msg.classList.add('success'); }
          else { msg.textContent = '❌ ' + data.error; msg.classList.add('error'); }
        });
      }
    </script>
  `);
};

interface ArtistRow { id: number; name: string; department: string | null; }
interface AdminArtworkRow {
  id: number; title: string; artist_name: string; quarter: string;
  starting_price: number; status: string; winning_price: number | null;
}

export const adminView = (
  user: CurrentUser, artists: ArtistRow[], artworks: AdminArtworkRow[],
  currentQ: string, flash: { type: "success" | "error"; msg: string } | null = null
) => {
  const artistOpts = artists.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  const artistChips = artists.map(a => `<span class="chip">${escapeHtml(a.name)}${a.department ? ` · ${escapeHtml(a.department)}` : ""}</span>`).join("");
  const rows = artworks.map(a => `
    <tr>
      <td>${a.quarter}</td>
      <td><a href="/artwork/${a.id}">${escapeHtml(a.title)}</a></td>
      <td>${escapeHtml(a.artist_name)}</td>
      <td>${krw(a.starting_price)}</td>
      <td><span class="status-badge status-${a.status}">${
        a.status === "live" ? "진행중" : a.status === "pending" ? "시작 전" : "마감"
      }</span></td>
      <td>${a.winning_price ? krw(a.winning_price) : "-"}</td>
      <td class="actions">
        ${a.status === "pending" ? `<form method="post" action="/admin/artwork/${a.id}/start" style="display:inline"><button class="btn btn-sm btn-green">시작</button></form>` : ""}
        ${a.status === "live" ? `<form method="post" action="/admin/artwork/${a.id}/close" style="display:inline"><button class="btn btn-sm btn-orange">마감</button></form>` : ""}
        <form method="post" action="/admin/artwork/${a.id}/delete" style="display:inline" onsubmit="return confirm('정말 삭제하시겠습니까?')"><button class="btn btn-sm btn-red">삭제</button></form>
      </td>
    </tr>
  `).join("");

  return layout("관리자 대시보드", user, html`
    <h1>관리자 대시보드</h1>
    <section class="admin-section">
      <h2>👤 작가 등록</h2>
      <form method="post" action="/admin/artist" class="form inline-form">
        <input name="name" placeholder="작가 이름" required>
        <input name="department" placeholder="소속 (예: 영상의학과)">
        <input name="bio" placeholder="간단한 소개">
        <button type="submit" class="btn btn-primary">등록</button>
      </form>
      <div class="artist-list">${raw(artistChips)}</div>
    </section>

    <section class="admin-section">
      <h2>🎨 작품 등록</h2>
      <form method="post" action="/admin/artwork" enctype="multipart/form-data" class="form grid-form">
        <label>작가
          <select name="artist_id" required>
            <option value="">선택...</option>
            ${raw(artistOpts)}
          </select>
        </label>
        <label>분기 <input name="quarter" value="${currentQ}" required></label>
        <label>작품명 <input name="title" required></label>
        <label>이미지 <input type="file" name="image" accept="image/*"></label>
        <label>시작가 (원) <input type="number" name="starting_price" value="10000" min="0" step="1000" required></label>
        <label>최소 입찰 단위 (원) <input type="number" name="min_increment" value="1000" min="100" step="100" required></label>
        <label class="full">설명 <textarea name="description" rows="2"></textarea></label>
        <button type="submit" class="btn btn-primary full">작품 등록</button>
      </form>
    </section>

    <section class="admin-section">
      <h2>📋 등록된 작품</h2>
      ${artworks.length ? html`
        <table class="data-table">
          <thead><tr><th>분기</th><th>작품</th><th>작가</th><th>시작가</th><th>상태</th><th>낙찰가</th><th>관리</th></tr></thead>
          <tbody>${raw(rows)}</tbody>
        </table>
      ` : html`<p class="muted">등록된 작품이 없습니다.</p>`}
    </section>
  `, "", flash);
};

interface QuarterReport { quarter: string; total: number; sold: number; revenue: number; }
interface ArtistReport { artist_name: string; works: number; sold: number; revenue: number; }
interface BidderReport { display_name: string; department: string | null; won_count: number; spent: number; }
interface RecentReport { quarter: string; title: string; artist_name: string; winner: string | null; winning_price: number | null; }

export const reportsView = (
  user: CurrentUser,
  quarterly: QuarterReport[], byArtist: ArtistReport[],
  topBidders: BidderReport[], recent: RecentReport[]
) => {
  const tableOrEmpty = (rows: string, cols: number) =>
    rows || `<tr><td colspan="${cols}" class="muted">데이터 없음</td></tr>`;

  return layout("경매 통계", user, html`
    <h1>📊 경매 통계 리포트</h1>
    <section class="report-section">
      <h2>분기별 실적</h2>
      <table class="data-table">
        <thead><tr><th>분기</th><th>등록 작품</th><th>낙찰</th><th>총 매출</th></tr></thead>
        <tbody>${raw(tableOrEmpty(quarterly.map(q => `<tr><td>${q.quarter}</td><td>${q.total}</td><td>${q.sold}</td><td><strong>${krw(q.revenue)}</strong></td></tr>`).join(""), 4))}</tbody>
      </table>
    </section>
    <section class="report-section">
      <h2>작가별 실적</h2>
      <table class="data-table">
        <thead><tr><th>작가</th><th>출품</th><th>낙찰</th><th>매출</th></tr></thead>
        <tbody>${raw(tableOrEmpty(byArtist.map(a => `<tr><td>${escapeHtml(a.artist_name)}</td><td>${a.works}</td><td>${a.sold}</td><td><strong>${krw(a.revenue)}</strong></td></tr>`).join(""), 4))}</tbody>
      </table>
    </section>
    <section class="report-section">
      <h2>🏆 TOP 낙찰자</h2>
      <table class="data-table">
        <thead><tr><th>순위</th><th>이름</th><th>부서</th><th>낙찰 건수</th><th>총 지출</th></tr></thead>
        <tbody>${raw(tableOrEmpty(topBidders.map((b, i) => `<tr><td>${i+1}</td><td>${escapeHtml(b.display_name)}</td><td>${escapeHtml(b.department || "-")}</td><td>${b.won_count}</td><td><strong>${krw(b.spent)}</strong></td></tr>`).join(""), 5))}</tbody>
      </table>
    </section>
    <section class="report-section">
      <h2>최근 낙찰 기록</h2>
      <table class="data-table">
        <thead><tr><th>분기</th><th>작품</th><th>작가</th><th>낙찰자</th><th>낙찰가</th></tr></thead>
        <tbody>${raw(tableOrEmpty(recent.map(r => `<tr><td>${r.quarter}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.artist_name)}</td><td>${escapeHtml(r.winner || "유찰")}</td><td><strong>${krw(r.winning_price)}</strong></td></tr>`).join(""), 5))}</tbody>
      </table>
    </section>
  `);
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
