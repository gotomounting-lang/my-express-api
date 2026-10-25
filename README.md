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
| POST | `/auth/login` | 토큰 발급 | 없음 |
| POST | `/auth/logout` | 토큰 폐기 | 없음 |

보호된 라우트는 `Authorization: Bearer <token>` 헤더가 필요합니다.
인증 없음은 401, 권한 부족은 403을 반환합니다.

## 구조

- `index.js`: 서버 진입점
- `src/api/auth.js`: 가입/로그인/로그아웃, `requireAuth`
- `src/api/authorize.ts`: `authorize(...roles)`, `errorHandler`, 타입 정의

## 참고

- 사용자와 토큰은 메모리에 저장되어 서버 재시작 시 초기화됩니다.
- 타입 체크: `npx tsc -p .`
