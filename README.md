# 토닥토닥 — Backend

> 지친 사람에게 말을 걸어 주고 **작은 회복 미션**을 제안하는 공감 챗봇 '포근이'의 API 서버
> Express · Google Gemini API

| 구분 | 레포 |
|---|---|
| **Backend (이 레포)** | Node.js · Express · Gemini API |
| Frontend | [Huss_todak_frontend](https://github.com/jonny0323/Huss_todak_frontend) (React + Vite) |

<!-- TODO: 해커톤/공모전 이름, 기간, 팀 구성과 본인 역할 한 줄 -->

---

## 1. 문제

- 마음이 힘든 사람에게 범용 챗봇은 **말투가 딱딱하거나 진단·처방처럼** 들릴 수 있다.
- 자해·자살 같은 **위기 신호**가 나왔을 때 LLM이 즉석에서 만든 안내문에 의존하면 위험하다.

## 2. 핵심 설계

| 설계 | 내용 |
|---|---|
| **구조화된 응답(JSON Schema)** | 자유 텍스트 대신 `reply`(답변) · `quest`(미션 제안) · `crisis`(위기 신호) 세 필드로 응답을 강제 → 프론트가 화면 요소별로 안정적으로 렌더링 |
| **위기 안내문은 고정 문구** | 모델은 위기 여부·심각도만 판단하고, 사용자에게 보이는 상담전화(1393, 1577-0199) 안내는 **서버에 고정된 문구**로 내보냄 → 잘못된 번호가 생성될 위험 제거 |
| **페르소나·금지사항** | 시스템 프롬프트로 말투, 진단/처방 금지, 위기 시 대화를 끊지 않고 먼저 공감하기 등을 관리 |
| **일시 오류 재시도** | Gemini가 503(과부하)·429(rate limit)를 반환하면 **지수 백오프**로 최대 3회 재시도 |
| **파싱 실패 대비** | 모델이 스키마를 벗어난 응답을 줘도 서버가 죽지 않고 기본 응답으로 처리 |
| **대화 맥락 제한** | 최근 10턴만 전달해 토큰 비용과 응답 지연을 관리 |

## 3. 아키텍처

```
[React Front] ──POST /api/chat──▶ [Express] ──▶ Gemini API
                                     │
                         JSON 응답 파싱 · 위기 안내문 결합
```

## 4. API

### `POST /api/chat`

```json
// Request
{ "message": "사람 연락도 싫고 답답해.",
  "history": [{ "role": "user", "text": "..." }, { "role": "bot", "text": "..." }] }

// Response
{ "reply": "그럴 수 있어. 무리하지 않아도 돼.",
  "quest": { "title": "창문 열기", "description": "1분만 바깥 공기 쐬기", "xp": 10 },
  "crisis": null,
  "crisisNotice": null }
```

### `GET /api/health`
서버 상태와 Gemini 키 설정 여부 확인

## 5. 실행 방법

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY, FRONTEND_ORIGIN 설정
npm run dev            # http://localhost:8787
```
