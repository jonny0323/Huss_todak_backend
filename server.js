import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenAI, Type } from '@google/genai'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8787
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'Gemini 3 Flash'

// 콤마로 여러 origin을 넣을 수 있다. 예:
// FRONTEND_ORIGIN=http://localhost:5173,https://huss-todak-frontend.vercel.app
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const corsOptions = {
  origin(origin, callback) {
    // origin이 없는 요청(curl, 서버 간 호출 등)은 허용
    if (!origin) return callback(null, true)
    if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true)
    }
    return callback(new Error(`CORS: ${origin} 은 허용되지 않은 origin이에요.`))
  },
}

app.use(cors(corsOptions))
app.use(express.json())

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null

// 사용자에게 보여줄 대화체 답변 + (선택적) 퀘스트 제안 + (선택적) 위기 신호를
// 하나의 JSON으로 강제하는 응답 스키마.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: '사용자에게 보여줄 대화체 답변. 2~3문장 이내, 반말 금지, 다정한 존댓말.',
    },
    quest: {
      type: Type.OBJECT,
      nullable: true,
      description:
        '아주 작은 퀘스트를 제안할 때만 채운다. 제안하지 않는 턴에는 이 필드 자체를 생략한다.',
      properties: {
        title: { type: Type.STRING, description: '퀘스트 이름. 10자 내외로 짧게.' },
        description: { type: Type.STRING, description: '퀘스트에 대한 한 줄 설명.' },
        xp: { type: Type.INTEGER, description: '완료 시 지급할 경험치. 5~20 사이.' },
      },
      required: ['title', 'xp'],
    },
    crisis: {
      type: Type.OBJECT,
      nullable: true,
      description:
        '자해/자살/극단적 표현 등 위기 신호가 감지될 때만 채운다. 그 외에는 생략한다.',
      properties: {
        level: {
          type: Type.STRING,
          enum: ['low', 'medium', 'high'],
          description: '위기 신호의 심각도 판단.',
        },
      },
      required: ['level'],
    },
  },
  required: ['reply'],
}

const SYSTEM_PROMPT = `
당신은 고립은둔청년의 회복을 돕는 AI 동행자 '하루'입니다.

## 핵심 역할
- 상담사와 내담자 사이의 일상적 연결 창구
- 치료가 아닌 '동행'이 목적
- 작은 외부 활동을 자연스럽게 유도

## 말투 원칙
- 친구처럼 편하게, 존댓말은 쓰되 딱딱하지 않게
- "해야 해요", "권장드려요" 같은 지시형 금지
- 공감 먼저, 제안은 나중에
- reply는 3문장 이내로 짧게

## 절대 하지 말아야 할 것
- 은둔을 비판하거나 "왜 안 나가요?"식 압박
- 과거 실패나 원인 추궁
- 억지로 긍정 유도 ("할 수 있어요!")
- 진단명이나 심리학 용어 사용

## 응답 형식
반드시 아래 스키마에 맞는 JSON으로만 응답한다. (reply, quest, crisis 세 필드)
- reply: 항상 채운다. 실제 대화 내용.
- quest: 아래 두 경우에는 **반드시** 채운다. 되묻기만 하고 넘어가지 않는다.
  1. 사용자가 "퀘스트 줘", "미션 줘", "퀘스트 더 줘", "그거 퀘스트로 줘" 등 **명시적으로 퀘스트/미션을 요청**한 경우
     → 이 경우 절대 "어떤 마음으로요?" 같은 되묻기 답변만 하고 quest를 비워두지 않는다. 정보가 부족하면 상식적으로 알아서 채운다.
  2. 사용자가 하고 싶은 구체적인 장소나 행동을 스스로 언급한 경우 (예: "청라 호수공원 가고 싶어")
     → 그 내용을 그대로 quest.title/description에 반영한다. (예: title: "청라 호수공원 산책하기")
  - 위 두 경우가 아니라면, 대화가 몇 턴 흐르고 상대가 어느 정도 마음을 연 것 같을 때 자연스럽게 먼저 제안해도 된다. 이때는 굳이 매턴 제안하지 않는다.
  - 완료를 독촉하는 뉘앙스는 reply에도 quest에도 넣지 않는다.
  - 예: {"title": "메모 한 줄 적기", "description": "오늘 신경 쓰였던 일 한 줄만 적어봐요.", "xp": 10}
- crisis: 자해, 자살, 극단적 위험 신호가 보일 때만 채운다. 그 외에는 절대 채우지 않는다.
  - crisis를 채우더라도 reply에서 상대를 다그치거나 갑자기 대화를 끊지 않고, 먼저 공감한다.

---
아래는 담당 상담사가 입력한 내담자 정보입니다.
이 정보를 바탕으로 대화 방식과 퀘스트 수준을 조정하세요.
`

// 위기 신호(crisis)가 감지됐을 때 사용자에게 보여줄 고정 안내문.
const CRISIS_NOTICE =
  '지금 많이 힘든 것 같아 걱정돼요. 혼자 감당하기 어려운 순간이라면 아래 번호로 연락해보는 것도 방법이에요.\n' +
  '- 자살예방상담전화: 1393 (24시간)\n' +
  '- 정신건강 위기상담전화: 1577-0199 (24시간)'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Gemini가 503(과부하)이나 429(rate limit) 같은 일시적인 오류를 낼 때
// 잠깐 기다렸다가 자동으로 재시도한다.
async function generateWithRetry(params, { retries = 3, baseDelayMs = 800 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await ai.models.generateContent(params)
    } catch (err) {
      const status = err?.status || err?.error?.code
      const isTransient = status === 503 || status === 429
      const isLastAttempt = attempt === retries

      if (!isTransient || isLastAttempt) throw err

      const delay = baseDelayMs * 2 ** attempt
      console.warn(`Gemini ${status} - ${delay}ms 후 재시도 (${attempt + 1}/${retries})`)
      await sleep(delay)
    }
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, geminiConfigured: Boolean(GEMINI_API_KEY) })
})

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {}

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message가 필요해요.' })
    }

    if (!ai) {
      return res.json({
        reply:
          '지금은 서버에 GEMINI_API_KEY가 설정되어 있지 않아서 임시 답변을 보내고 있어. .env 파일을 확인해줘.',
        quest: null,
        crisis: null,
      })
    }

    const contents = []

    if (Array.isArray(history)) {
      for (const turn of history.slice(-10)) {
        if (!turn || !turn.text) continue
        const role = turn.role === 'bot' ? 'model' : 'user'
        contents.push({ role, parts: [{ text: String(turn.text) }] })
      }
    }

    contents.push({ role: 'user', parts: [{ text: message }] })

    const response = await generateWithRetry({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 500,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    })

    let parsed
    try {
      parsed = JSON.parse(response.text)
    } catch (parseErr) {
      console.error('Gemini JSON 파싱 실패:', parseErr, response.text)
      return res.json({
        reply: '음... 지금은 무슨 말을 해줘야 할지 잘 모르겠어. 다시 한 번 말해줄래?',
        quest: null,
        crisis: null,
      })
    }

    res.json({
      reply: parsed.reply || '음... 지금은 무슨 말을 해줘야 할지 잘 모르겠어. 다시 한 번 말해줄래?',
      quest: parsed.quest || null,
      crisis: parsed.crisis || null,
      crisisNotice: parsed.crisis ? CRISIS_NOTICE : null,
    })
  } catch (err) {
    console.error('Gemini 호출 실패:', err)
    const status = err?.status || err?.error?.code
    const isOverloaded = status === 503 || status === 429
    res.status(500).json({
      error: isOverloaded
        ? '지금 Gemini 서버가 많이 붐벼서 잠깐 답을 못 받아왔어요. 조금 있다가 다시 보내주세요.'
        : '답변을 가져오는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.',
    })
  }
})

app.listen(PORT, () => {
  console.log(`토닥토닥 백엔드 서버가 http://localhost:${PORT} 에서 실행 중이에요.`)
  if (!GEMINI_API_KEY) {
    console.warn('경고: GEMINI_API_KEY가 설정되지 않았어요. .env 파일을 확인하세요.')
  }
})