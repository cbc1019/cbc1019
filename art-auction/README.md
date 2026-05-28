# 🎨 병원 그림 경매 시스템

병원 내 그림작가(직원)들이 분기마다 그림을 출품하고, 직원들이 실시간으로 입찰하여 낙찰받는 **영국식 실시간 경매 웹 애플리케이션**입니다.

## 주요 기능

- **작가/작품 관리** — 관리자가 작가 프로필과 작품을 분기별로 등록
- **직원 회원가입/로그인** — 부서 정보 포함
- **실시간 영국식 경매** — Socket.IO 기반, 입찰가 즉시 반영
- **낙찰 통계 리포트** — 분기별·작가별 매출, TOP 낙찰자, 최근 낙찰 내역

## 설치 및 실행

```bash
cd art-auction
pip install -r requirements.txt
python app.py
```

브라우저에서 `http://localhost:5000` 으로 접속하세요.

### 기본 관리자 계정
- 아이디: `admin`
- 비밀번호: `admin1234`

> ⚠️ 운영 환경에 배포하기 전에 반드시 비밀번호를 변경하고, `SECRET_KEY` 환경변수를 설정하세요.

## 사용 흐름

1. **관리자**가 `관리` 메뉴에서 작가 → 작품을 등록
2. 작품 등록 시 **분기**, **시작가**, **최소 입찰 단위**를 지정
3. 경매를 **시작** 버튼으로 활성화 (`pending` → `live`)
4. **직원**이 회원가입 후 작품 상세 페이지에서 실시간 입찰
5. 관리자가 **마감** 버튼을 누르면 최고가 입찰자가 자동 낙찰
6. `통계` 메뉴에서 분기별 매출 등 리포트 확인

## 디렉토리 구조

```
art-auction/
├── app.py                  # Flask 메인 (라우팅, DB, SocketIO)
├── requirements.txt
├── art_auction.db          # 최초 실행 시 자동 생성
├── templates/
│   ├── base.html
│   ├── login.html / register.html
│   ├── index.html          # 경매 작품 목록
│   ├── artwork.html        # 실시간 입찰 페이지
│   ├── admin.html          # 관리자 대시보드
│   └── reports.html        # 통계 리포트
└── static/
    ├── style.css
    └── uploads/            # 작품 이미지 저장 위치
```

## 데이터 모델

- `users` — 직원/관리자 계정 (`is_admin` 플래그)
- `artists` — 그림 작가 프로필
- `artworks` — 작품 (분기·시작가·상태: pending/live/closed·낙찰 정보)
- `bids` — 입찰 기록 (작품·사용자·금액·시각)

## 보안 노트

- 비밀번호는 `werkzeug.security`로 해시 저장
- 입찰 시 서버 측에서 최소 가격·경매 상태 검증
- 운영 시 `SECRET_KEY` 환경변수 필수, HTTPS 권장
