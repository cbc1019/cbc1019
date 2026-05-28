# 🎨 병원 그림 경매 - Cloudflare Workers

병원 그림 경매 시스템의 **Cloudflare 네이티브 버전**입니다. Workers + D1 + R2 + Durable Objects 만으로 동작합니다.

## 아키텍처

- **Workers (Hono)** — 백엔드 API + 서버사이드 HTML 렌더링
- **D1** — SQLite 호환 데이터베이스 (users, artists, artworks, bids)
- **R2** — 작품 이미지 객체 저장소
- **Durable Objects** — 작품별 WebSocket 실시간 입찰 룸
- **Web Crypto API** — PBKDF2 패스워드 해싱, HMAC 세션 서명

## 배포 가이드

```bash
cd cloudflare-auction
npm install

# 1) Wrangler 로그인 (브라우저 OAuth)
npx wrangler login

# 2) D1 데이터베이스 생성 → 출력된 database_id 를 wrangler.toml 에 붙여넣기
npx wrangler d1 create auction-db

# 3) R2 버킷 생성
npx wrangler r2 bucket create art-auction-images

# 4) 스키마 적용
npm run db:init

# 5) 세션 시크릿 설정 (랜덤 문자열)
npx wrangler secret put SESSION_SECRET
# (선택) 초기 관리자 비밀번호
npx wrangler secret put ADMIN_PASSWORD

# 6) 배포
npm run deploy
```

배포 후 출력되는 URL(`https://art-auction.<your-subdomain>.workers.dev`)로 접속하세요.

### 기본 관리자
- 아이디: `admin`
- 비밀번호: `admin1234` (또는 `ADMIN_PASSWORD` 시크릿 값)

> ⚠️ 운영 전 반드시 관리자 비밀번호를 변경하세요.

## 디렉토리 구조

```
cloudflare-auction/
├── wrangler.toml         # CF 리소스 바인딩 (D1/R2/DO)
├── package.json
├── tsconfig.json
├── schema.sql            # D1 스키마
└── src/
    ├── index.ts          # Hono 앱 (모든 라우트)
    ├── auth.ts           # PBKDF2 + HMAC 세션
    ├── auction-room.ts   # Durable Object (WebSocket 룸)
    └── views.ts          # 서버사이드 HTML 렌더링
```

## 비용 안내 (2026년 기준 무료 한도)

- **Workers**: 일 100,000 요청 무료
- **D1**: 일 100,000 row read / 50,000 row write 무료
- **R2**: 월 10GB 저장 + 100만 Class A 요청 무료
- **Durable Objects**: 월 1M 요청 + 400,000 GB-s 무료

소규모 병원 사내 사용에는 무료 한도로 충분합니다.

## 로컬 개발

```bash
npx wrangler d1 execute auction-db --local --file=./schema.sql
npm run dev
```

http://localhost:8787 접속
