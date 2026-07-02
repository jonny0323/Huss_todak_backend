# 토닥토닥 백엔드 (Express + Gemini API)

포근이 챗봇의 응답을 Gemini API로 생성하는 아주 작은 Express 서버입니다.

## 로컬 실행

```bash
cd todak-todak-backend
npm install
cp .env.example .env
```

`.env` 파일을 열어 `GEMINI_API_KEY`에 Google AI Studio에서 발급받은 키를 넣어주세요.
(https://aistudio.google.com/apikey 에서 무료로 발급 가능)

```bash
npm run dev
```

`http://localhost:8787` 에서 실행됩니다.

## API

### `GET /api/health`
서버와 Gemini 키 설정 상태 확인용.

```json
{ "ok": true, "geminiConfigured": true }
```

### `POST /api/chat`
요청:
```json
{
  "message": "사람 연락도 싫고 답답해.",
  "history": [
    { "role": "user", "text": "이전 사용자 메시지" },
    { "role": "bot", "text": "이전 포근이 답변" }
  ]
}
```

응답:
```json
{ "reply": "그럴 수 있어. 무리하지 않아도 돼." }
```

`history`는 선택 사항이며, 최근 10턴까지만 반영합니다.

## 포근이 페르소나

`server.js`의 `SYSTEM_PROMPT`에서 말투, 금지사항(진단/처방 금지), 위기 상황 시
전문기관 안내 문구 등을 관리합니다. 필요에 맞게 수정하세요.

## 배포

### Render / Railway 등 별도 서버
그대로 배포하면 됩니다. 환경변수(`GEMINI_API_KEY`, `FRONTEND_ORIGIN` 등)만 설정해주세요.
`FRONTEND_ORIGIN`은 배포된 프론트엔드(Vercel) 주소로 지정해야 CORS 에러가 안 납니다.

### Vercel Serverless Function으로 합치고 싶다면
현재는 별도 Express 서버 구조입니다. Vercel 한 프로젝트에 프론트+백엔드를 같이 올리고
싶다면 `api/chat.js` 형태의 서버리스 함수로 변환이 필요해요. 원하시면 그 구조로도
바꿔드릴 수 있습니다.

## 프론트엔드 연결

`todak-todak` 프론트엔드의 `.env`에 아래처럼 백엔드 주소를 넣으면 자동으로 연결됩니다.

```
VITE_API_URL=http://localhost:8787
```
