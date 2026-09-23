# 충슐랭 가이드

충주 시민이 직접 맛집을 올리고, 가본 사람이 **맛 · 서비스 · 분위기·청결 · 가성비**를 평가하는 맛집 가이드입니다.
리뷰가 3개 이상 모이면 종합 점수에 따라 사과꽃 등급이 붙습니다.

| 등급 | 조건 |
|---|---|
| 사과꽃 3개 | 종합 4.5 이상 · 일부러 충주에 올 가치 |
| 사과꽃 2개 | 종합 4.0 이상 · 먼 길 돌아갈 가치 |
| 사과꽃 1개 | 종합 3.5 이상 · 지나다 들를 가치 |
| 충주 추천 | 리뷰 3개 이상, 종합 3.5 미만 |
| 심사 중 | 리뷰 3개 미만 |

## 구성

- `index.html` — 홈페이지 전체 (빌드 과정 없음, GitHub Pages로 바로 배포)
- `config.js` — Supabase 연결 정보
- `supabase/schema.sql` — 테이블, 접근 규칙, 사진 저장소, 실시간 설정
- `supabase/seed.sql` — (선택) 처음 목록에 보일 충주 가게 4곳

데이터베이스는 [Supabase](https://supabase.com)(무료 요금제로 충분)를 씁니다.
방문자는 가입하지 않아도 되고, 처음 등록하거나 리뷰를 쓸 때 브라우저별 **익명 계정**이 자동으로 만들어집니다.
그래서 같은 브라우저에서는 자기 리뷰를 고치거나 지울 수 있고, 남의 글은 고칠 수 없습니다.

### 데이터 구조

```
places   맛집       id, name, category, area, address, signature, price(1~4), description, added_by
reviews  리뷰       place_id, author, nickname, taste, service, mood, value (각 1~5),
                    overall(네 항목 평균, 자동 계산), revisit, body, visited(YYYY-MM)
                    → 한 사람당 가게 하나에 리뷰 하나 (place_id + author 유일)
photos   사진       place_id, review_id(없으면 가게 등록 사진), author, path
place_stats (뷰)    가게별 리뷰 수, 종합·항목별 평균, 재방문 비율
Storage  photos 버킷  <작성자id>/<사진id>.jpg (원본), _t.jpg (썸네일)
```

접근 규칙: 누구나 읽기 · 로그인(익명 포함)한 사람만 쓰기 · 자기 글과 사진만 수정·삭제 · 가게는 리뷰가 없을 때만 등록한 사람이 삭제.

## 설치 방법

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 에 가입하고 **New project**를 만듭니다 (Region은 Seoul 추천).
2. 왼쪽 메뉴 **SQL Editor**에서 `supabase/schema.sql` 내용을 통째로 붙여넣고 **Run**을 누릅니다.
3. (선택) 이어서 `supabase/seed.sql`도 실행하면 가게 4곳이 미리 들어갑니다.

### 2. 익명 로그인 켜기
**Authentication → Sign In / Providers**에서 **Allow anonymous sign-ins**를 켜고 저장합니다.
이걸 켜지 않으면 목록은 보이지만 등록과 리뷰는 할 수 없습니다.

> 장난 글이 걱정되면 같은 화면 아래의 **CAPTCHA**(Turnstile/hCaptcha) 보호와 **Rate Limits**를 켜 두는 것을 권장합니다.

### 3. 연결 정보 넣기
**Project Settings → API**(또는 **Data API / API Keys**)에서 아래 두 값을 복사해 `config.js`에 넣습니다.

- Project URL → `SUPABASE_URL`
- `anon` `public` 키 (또는 `sb_publishable_...` 키) → `SUPABASE_ANON_KEY`

anon 키는 공개돼도 괜찮은 키입니다. **`service_role` / secret 키는 절대 넣지 마세요.**

### 4. GitHub Pages로 배포
1. 저장소 **Settings → Pages**로 갑니다.
2. Source를 **Deploy from a branch**로, Branch를 `main` / `/ (root)`로 두고 저장합니다.
3. 1~2분 뒤 `https://<계정>.github.io/<저장소>/` 주소로 접속할 수 있습니다.

## 로컬에서 보기

`index.html`을 파일로 바로 열면 브라우저 보안 때문에 일부 기능이 막힐 수 있습니다. 간단한 서버로 여세요.

```bash
npx serve .        # 또는  python -m http.server 8000
```
