# my-express-api

Express 기반 간단한 REST API 프로젝트 (인증 및 역할 기반 권한 포함).

## 구성
- `index.js`: 서버 진입점 (포트 3000). 직접 실행 시에만 listen, `app` export
- `src/api/auth.js`: `/auth` 라우터(register/login/logout), `requireAuth` 미들웨어. 사용자·토큰은 메모리 저장
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
- `POST /auth/login`: 토큰 발급
- `POST /auth/logout`: 토큰 폐기
- 인증: `Authorization: Bearer <token>`. 미인증 401, 권한 부족 403

## 명령어
- 설치: `npm install`
- 실행: `npm start` (`tsx index.js`, `node index.js`는 .ts를 못 불러옴)
- 테스트: `npm test`
- 타입 체크: `npx tsc -p .`

## 상태
- GitHub: https://github.com/gotomounting-lang/my-express-api (public, `main`)
