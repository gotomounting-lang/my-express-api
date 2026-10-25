# my-express-api

Express 기반 간단한 REST API 프로젝트 (인증 및 역할 기반 권한 포함).

## 구성
- `index.js`: 서버 진입점 (포트 3000). 직접 실행 시에만 listen, `app` export
- `src/api/auth.js`: `/auth` 라우터(register/login/logout), `requireAuth` 미들웨어. JWT(HS256) access(15분)/refresh(7일) 토큰, 사용자·차단 목록·refresh 목록은 메모리 저장
- `src/api/authorize.ts`: `authorize(...roles)`, `errorHandler`, `HttpError`, 타입 정의
- `test/api.test.js`: `node:test` 기반 API 테스트
- `tsconfig.json`: 타입 체크용 (`noEmit`)
- `package.json`: express, 개발 의존성 typescript/tsx/@types/*
- `.gitignore`: `node_modules/`, `.env`, `.DS_Store`, `npm-debug.log*`

## 라우트
- `GET /`: `{ message: 'Hello, Express!' }`
- `POST /`: body를 `received`로 반환 (201)
- `PUT /:id`: 인증 필요, `admin`/`user`. `id`와 body를 `updated`로 반환
- `DELETE /:id`: 인증 필요, `admin`만. `id`와 `deleted: true` 반환
- `POST /auth/register`: 가입 (첫 가입자 `admin`, 이후 `user`)
- `POST /auth/login`: `{ accessToken, refreshToken }` 발급
- `POST /auth/refresh`: body `refreshToken`으로 새 토큰 쌍 발급 (rotation, 재사용 시 401)
- `POST /auth/logout`: access `jti`를 차단 목록에 추가, body `refreshToken`도 폐기
- 인증: `Authorization: Bearer <token>`. 미인증 401, 권한 부족 403

## 명령어
- 설치: `npm install`
- 실행: `npm start` (`tsx index.js`, `node index.js`는 .ts를 못 불러옴)
- 테스트: `npm test`
- 타입 체크: `npx tsc -p .`
- 환경변수: `JWT_SECRET`을 `.env`로 관리 (`process.loadEnvFile`, `.env.example` 참고). 미설정 시 실행마다 랜덤, 재시작하면 기존 토큰 무효

## 상태
- GitHub: https://github.com/gotomounting-lang/my-express-api (public, `main`)
