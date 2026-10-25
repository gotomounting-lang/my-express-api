# my-express-api

Express 기반 간단한 REST API (인증 및 역할 기반 권한 포함).

## 설치 및 실행

```bash
npm install
npm start   # http://localhost:3000
```

## 라우트

| Method | Path | 설명 | 권한 |
|--------|------|------|------|
| GET | `/` | Hello 메시지 | 없음 |
| POST | `/` | body를 `received`로 반환 (201) | 없음 |
| PUT | `/:id` | `id`와 body를 `updated`로 반환 | `admin`, `user` |
| DELETE | `/:id` | `id`와 `deleted: true` 반환 | `admin` |
| POST | `/auth/register` | 가입 (첫 가입자는 `admin`, 이후 `user`) | 없음 |
| POST | `/auth/login` | `accessToken`(15분), `refreshToken`(7일) 발급 | 없음 |
| POST | `/auth/refresh` | body `refreshToken`으로 새 토큰 쌍 발급 (재사용 시 401) | 없음 |
| POST | `/auth/logout` | access 토큰 무효화, body `refreshToken`도 폐기 | 없음 |

보호된 라우트는 `Authorization: Bearer <token>` 헤더가 필요합니다.
인증 없음은 401, 권한 부족은 403을 반환합니다.

## Rate limiting

- 전역: IP당 15분에 100회 (`RATE_LIMIT`)
- `/auth/*`: IP당 15분에 10회 (`AUTH_RATE_LIMIT`)
- 초과 시 429 `{ "error": "too many requests" }`

## 구조

- `index.js`: 서버 진입점
- `src/api/auth.js`: 가입/로그인/로그아웃, `requireAuth`
- `src/api/rateLimit.js`: rate limit 설정
- `src/api/authorize.ts`: `authorize(...roles)`, `errorHandler`, 타입 정의

## 참고

- `.env.example`을 `.env`로 복사해 `JWT_SECRET`(서명 키)을 설정합니다. 미설정 시 실행마다 랜덤 키를 사용해 재시작하면 기존 토큰이 무효가 됩니다.
- 사용자와 토큰 차단·refresh 목록은 메모리에 저장되어 서버 재시작 시 초기화됩니다.
- 타입 체크: `npx tsc -p .`
