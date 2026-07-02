import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8787
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*'

app.use(cors({ origin: FRONTEND_ORIGIN }))
app.use(express.json())

const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null

const SYSTEM_PROMPT = `너는 '포근이'라는 이름의 다정한 마스코트 친구야. '토닥토닥'이라는 앱에서
사회적으로 위축되거나 외로움을 느끼는 사람과 짧은 대화를 나눠.

규칙:
- 항상 반말로, 짧고 따뜻하게 대답해. 2~3문장을 넘기지 마.
- 상대의 감정을 먼저 인정해주고, 판단하거나 다그치지 마.
- 상담사나 의사인 척하지 말고, 진단이나 처방을 내리지 마.
- 아주 작고 구체적인 행동(예: 메모 한 줄 적기, 물 한 잔 마시기) 하나만 부드럽게 제안할 수 있어.
- 위기 신호(자해, 자살, 심각한 위험)가 보이면 다정하게 걱정을 표현하고,
  전문 상담 기관(예: 자살예방상담전화 1393, 정신건강 상담전화 1577-0199)에 연락해보길
  권해. 절대 무시하거나 가볍게 넘기지 마.
- 이모지는 쓰지 말고, 자연스러운 한국어 채팅체로 답해.`

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

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 200,
        temperature: 0.8,
      },
    })

    const reply = response.text?.trim() || '음... 지금은 무슨 말을 해줘야 할지 잘 모르겠어. 다시 한 번 말해줄래?'

    res.json({ reply })
  } catch (err) {
    console.error('Gemini 호출 실패:', err)
    res.status(500).json({
      error: '답변을 가져오는 중 문제가 생겼어요. 잠시 후 다시 시도해주세요.',
    })
  }
})

app.listen(PORT, () => {
  console.log(`토닥토닥 백엔드 서버가 http://localhost:${PORT} 에서 실행 중이에요.`)
  if (!GEMINI_API_KEY) {
    console.warn('경고: GEMINI_API_KEY가 설정되지 않았어요. .env 파일을 확인하세요.')
  }
})
