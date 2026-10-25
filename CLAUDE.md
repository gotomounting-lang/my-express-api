# my-express-api

Express 기반 간단한 REST API 프로젝트.

## 구성
- `index.js`: 서버 진입점 (포트 3000)
- `package.json`: npm 설정 (express 의존성)
- `.gitignore`: `node_modules/`, `.env`, `.DS_Store`, `npm-debug.log*`

## 라우트
- `GET /`: `{ message: 'Hello, Express!' }`
- `POST /`: body를 `received`로 반환 (201)
- `PUT /:id`: `id`와 body를 `updated`로 반환
- `DELETE /:id`: `id`와 `deleted: true` 반환

## 명령어
- 설치: `npm install`
- 실행: `node index.js`
- 테스트: `curl localhost:3000`

## 상태
- git 초기화 및 첫 커밋 완료 (`e54704c`)
