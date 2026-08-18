import { atom, host, haptic, usePluginI18n, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ID = 'hermes-avatar-v5'
const FW = 96
const FH = 104
const CW = 1152
const CH = 624
const FXW = 1248
const FXH = 104
const CHARACTER_FILE = 'NIVO_CHARACTER_ATLAS_v3_aligned.png'
const FX_FILE = 'NIVO_FX_ATLAS_v2.png'

const IDLE = [4, 5, 6, 5].map(col => ({ row: 0, col }))
const IDLE_FPS = 2
const BLINK = [5, 3, 5].map(col => ({ row: 1, col }))
const BLINK_FPS = 4
const TALK = Array.from({ length: 6 }, (_, col) => ({ row: 2, col }))
const EXPRESSIONS = Array.from({ length: 12 }, (_, col) => ({ row: 3, col }))
const ACTIONS = Array.from({ length: 10 }, (_, col) => ({ row: 4, col }))
const PET = Array.from({ length: 8 }, (_, col) => ({ row: 5, col }))

const CHIP_OPEN = atom(false)

const ACTION_SEQ = {
  wave: [ACTIONS[0]],
  point: [ACTIONS[1]],
  ok: [ACTIONS[2]],
  thumbs: [ACTIONS[3]],
  cute: [ACTIONS[4]],
  hug: [ACTIONS[5]],
  sleep: [ACTIONS[6]],
  processing: [ACTIONS[7]],
  focus: [ACTIONS[8]],
  agent: [ACTIONS[9]]
}

const ACTION_ORDER = [
  ['wave', '1 Wave'],
  ['point', '2 Point'],
  ['ok', '3 OK'],
  ['thumbs', '4 Thumbs'],
  ['cute', '5 Cute'],
  ['hug', '6 Hug'],
  ['sleep', '7 Sleep'],
  ['processing', '8 Process'],
  ['focus', '9 Focus'],
  ['agent', '10 Agent']
]

const ACTION_FPS = {
  wave: 1,
  point: 1,
  ok: 1,
  thumbs: 1,
  cute: 1,
  hug: 1,
  sleep: 1,
  processing: 1,
  focus: 1,
  agent: 1
}

const ACTION_DURATION = {
  wave: 1800,
  point: 1800,
  ok: 1800,
  thumbs: 1800,
  cute: 1800,
  hug: 1800,
  sleep: 2400,
  processing: 2200,
  focus: 2200,
  agent: 2400
}

// Pixel alignment to keep the head/face anchored between expression/action frames.
// IDLE / BLINK / TALK / PET are intentionally left untouched.
const FRAME_ALIGN = {
  '3:0':[0,0], '3:1':[-1,-1], '3:2':[-4,-2], '3:3':[3,-1],
  '3:4':[1,-2], '3:5':[0,0], '3:6':[3,-1], '3:7':[-1,-4],
  '3:8':[4,-4], '3:9':[0,-3], '3:10':[0,-3], '3:11':[-1,-4],

  '4:0':[-6,-9], '4:1':[-1,-5], '4:2':[-4,-8], '4:3':[4,-8],
  '4:4':[0,-6], '4:5':[1,-1], '4:6':[-2,-8], '4:7':[1,-6],
  '4:8':[7,-6], '4:9':[4,-3]
}

function frameOffset(f) {
  return FRAME_ALIGN[`${f.row}:${f.col}`] || [0,0]
}

const EXPR = {
  neutral: [EXPRESSIONS[0]],

  smile: [
    EXPRESSIONS[0],
    EXPRESSIONS[1],
    EXPRESSIONS[2],
    EXPRESSIONS[1]
  ],

  excited: [
    EXPRESSIONS[1],
    EXPRESSIONS[2],
    ACTIONS[0],
    EXPRESSIONS[2],
    EXPRESSIONS[1]
  ],

  curious: [
    EXPRESSIONS[0],
    EXPRESSIONS[3],
    EXPRESSIONS[4],
    EXPRESSIONS[3]
  ],

  thinking: [
    EXPRESSIONS[3],
    EXPRESSIONS[4],
    EXPRESSIONS[4],
    EXPRESSIONS[3]
  ],

  surprised: [
    EXPRESSIONS[3],
    EXPRESSIONS[5],
    EXPRESSIONS[5],
    EXPRESSIONS[3]
  ],

  sad: [
    EXPRESSIONS[0],
    EXPRESSIONS[6],
    EXPRESSIONS[10],
    EXPRESSIONS[6]
  ],

  angry: [
    EXPRESSIONS[0],
    EXPRESSIONS[7],
    EXPRESSIONS[7],
    EXPRESSIONS[0]
  ],

  heart: [
    EXPRESSIONS[1],
    EXPRESSIONS[8],
    EXPRESSIONS[8],
    EXPRESSIONS[1]
  ],

  nod: [
    EXPRESSIONS[0],
    EXPRESSIONS[9],
    EXPRESSIONS[0],
    EXPRESSIONS[9]
  ],

  shake: [
    EXPRESSIONS[10],
    EXPRESSIONS[11],
    EXPRESSIONS[10],
    EXPRESSIONS[11]
  ]
}

const EXPR_FPS = {
  neutral: 6,
  smile: 4,
  excited: 4,
  curious: 3,
  thinking: 3,
  surprised: 3,
  sad: 3,
  angry: 3,
  heart: 3,
  nod: 3,
  shake: 4
}

const FX = {
  exclamation: 0,
  question: 1,
  idea: 2,
  heart: 3,
  sparkle: 4,
  star: 5,
  sweat: 6,
  zzz: 7,
  hover: 8,
  scan: 9,
  data: 10,
  loading: 11,
  glitch: 12
}

const PET_PHASES = ['idle', 'hand approach', 'touch', 'pet 01', 'pet 02', 'blush', 'very happy', 'purr']

function desktopBridge() {
  return typeof window !== 'undefined' ? window.hermesDesktop : null
}

async function readDataUrl(file) {
  const d = desktopBridge()
  if (!d?.desktopPluginsRoot || !d?.readFileDataUrl) {
    throw new Error('Hermes Desktop filesystem bridge is unavailable')
  }

  const root = await d.desktopPluginsRoot()
  if (!root) throw new Error('Hermes Desktop plugin root is unavailable')

  // Be tolerant when the user upgrades by replacing only plugin.js
  // inside an older hermes-avatar folder.
  const folders = Array.from(new Set([
    ID,
    'hermes-avatar',
    'hermes-avatar-v5'
  ]))

  let lastError = null

  for (const folder of folders) {
    try {
      const data = await d.readFileDataUrl(`${root}/${folder}/${file}`)

      if (typeof data === 'string' && data.startsWith('data:image/')) {
        return data
      }
    } catch (err) {
      lastError = err
    }
  }

  throw new Error(
    `Atlas file not found: ${file}. Expected it inside hermes-avatar-v5/ or hermes-avatar/.` +
    (lastError?.message ? ` (${lastError.message})` : '')
  )
}

function useAtlasAssets() {
  const [assets, setAssets] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all([readDataUrl(CHARACTER_FILE), readDataUrl(FX_FILE)])
      .then(([character, fx]) => alive && setAssets({ character, fx }))
      .catch(err => alive && setError(String(err?.message || err)))
    return () => { alive = false }
  }, [])
  return { assets, error }
}

function useHermesVoiceStatus() {
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const lifecycle = host.state?.voiceLifecycle
    const subscribe = host.onVoiceEvent

    if (!lifecycle?.get || typeof subscribe !== 'function') return undefined

    const sync = () => {
      const current = lifecycle.get()
      const next = current?.ttsSpeaking ? 'speaking' : current?.userSpeaking ? 'listening' : 'idle'
      setStatus(prev => prev === next ? prev : next)
    }

    sync()
    return subscribe('*', sync)
  }, [])

  return status
}

function CharacterSprite({ atlas, sequence, fps, loop, resetKey, smooth = false }) {
  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const [imageVersion, setImageVersion] = useState(0)

  useEffect(() => {
    if (!atlas) return undefined

    let alive = true
    const img = new Image()

    img.onload = () => {
      if (!alive) return
      imageRef.current = img
      setImageVersion(v => v + 1)
    }

    img.src = atlas

    return () => {
      alive = false
      img.onload = null
    }
  }, [atlas])

  useEffect(() => {
    const canvas = canvasRef.current
    const img = imageRef.current

    if (!canvas || !img || !sequence?.length) return undefined

    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let raf = 0
    let alive = true
    const start = performance.now()
    const frameMs = 1000 / Math.max(1, fps)
    let lastDiscrete = -1

    const smoothstep = t => t * t * (3 - 2 * t)

    const drawFrame = (f, alpha = 1) => {
      const [dx, dy] = frameOffset(f)
      ctx.globalAlpha = alpha
      ctx.drawImage(
        img,
        f.col * FW,
        f.row * FH,
        FW,
        FH,
        dx,
        dy,
        FW,
        FH
      )
    }

    const tick = now => {
      if (!alive || !canvasRef.current) return

      const elapsed = now - start
      const raw = elapsed / frameMs
      let i = Math.floor(raw)
      const phase = raw - Math.floor(raw)

      if (loop) i %= sequence.length
      else i = Math.min(i, sequence.length - 1)

      if (!smooth) {
        // Sprite animation should normally be a clean cell swap.
        // No alpha interpolation = no IDLE flicker / ghosting.
        if (i !== lastDiscrete) {
          ctx.clearRect(0, 0, FW, FH)
          drawFrame(sequence[i], 1)
          ctx.globalAlpha = 1
          lastDiscrete = i
        }
      } else {
        const current = sequence[i]
        let nextIndex = i + 1

        if (loop) nextIndex %= sequence.length
        else nextIndex = Math.min(nextIndex, sequence.length - 1)

        const next = sequence[nextIndex]

        ctx.clearRect(0, 0, FW, FH)

        // Only expression transitions get a short blend near the end.
        // Most of the frame is held solid.
        const blendStart = 0.78

        if (phase < blendStart || current === next) {
          drawFrame(current, 1)
        } else {
          const t = smoothstep((phase - blendStart) / (1 - blendStart))
          drawFrame(current, 1 - t)
          drawFrame(next, t)
        }

        ctx.globalAlpha = 1
      }

      if (loop || i < sequence.length - 1) {
        raf = requestAnimationFrame(tick)
      }
    }

    tick(performance.now())

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      ctx.globalAlpha = 1
    }
  }, [sequence, fps, loop, resetKey, smooth, imageVersion])

  return jsx('div', {
    className: 'nivo-character-window',
    children: jsx('canvas', {
      ref: canvasRef,
      width: FW,
      height: FH,
      className: 'nivo-character-canvas'
    })
  })
}

function FxSprite({ atlas, name }) {
  const canvasRef = useRef(null)
  const index = FX[name]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !atlas || index == null) return undefined

    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let alive = true
    const img = new Image()

    img.onload = () => {
      if (!alive) return
      ctx.clearRect(0, 0, FW, FH)
      ctx.drawImage(
        img,
        index * FW,
        0,
        FW,
        FH,
        0,
        0,
        FW,
        FH
      )
    }

    img.src = atlas

    return () => {
      alive = false
      img.onload = null
    }
  }, [atlas, index])

  if (index == null) return null

  return jsx('div', {
    className: 'nivo-fx-window',
    children: jsx('canvas', {
      ref: canvasRef,
      width: FW,
      height: FH,
      className: 'nivo-fx-canvas'
    })
  })
}

function CssFx({ name }) {
  if (name === 'hover') return jsx('div', { className: 'fx-hover' })
  if (name === 'scan') return jsx('div', { className: 'fx-scan' })
  if (name === 'data') return jsx('div', { className: 'fx-data', children: [1,2,3,4].map(i => jsx('i', { key: i })) })
  if (name === 'loading') return jsx('div', { className: 'fx-loading', children: '◌' })
  if (name === 'glitch') return jsx('div', { className: 'fx-glitch', children: [1,2,3,4].map(i => jsx('i', { key: i })) })
  return null
}

function HermesAvatar() {
  const t = usePluginI18n(ID)
  const { assets, error } = useAtlasAssets()
  const voiceStatus = useHermesVoiceStatus()
  const [mode, setMode] = useState('idle')
  const [expr, setExpr] = useState('neutral')
  const [action, setAction] = useState(null)
  const [effect, setEffect] = useState(null)
  const [blink, setBlink] = useState(false)
  const [petStage, setPetStage] = useState(0)
  const [resetKey, setResetKey] = useState(0)
  const talkTimer = useRef(null)
  const actionTimer = useRef(null)
  const sleepTimer = useRef(null)
  const effectTimer = useRef(null)
  const blinkTimer = useRef(null)
  const blinkEnd = useRef(null)
  const petTimers = useRef([])
  const cycleTimers = useRef([])
  const manualLockUntil = useRef(0)
  const visualStateRef = useRef({ mode:'idle', expr:'neutral', action:null })

  const clearPet = useCallback(() => {
    petTimers.current.forEach(clearTimeout)
    petTimers.current = []
  }, [])

  useEffect(() => {
    visualStateRef.current = { mode, expr, action }
  }, [mode, expr, action])

  useEffect(() => () => {
    clearTimeout(talkTimer.current)
    clearTimeout(actionTimer.current)
    clearTimeout(sleepTimer.current)
    clearTimeout(effectTimer.current)
    clearTimeout(blinkTimer.current)
    clearTimeout(blinkEnd.current)
    clearPet()
    cycleTimers.current.forEach(clearTimeout)
    cycleTimers.current = []
  }, [clearPet])

  const flash = useCallback((name, ms = 1100) => {
    clearTimeout(effectTimer.current)
    setEffect(name)
    effectTimer.current = setTimeout(() => setEffect(null), ms)
  }, [])

  const resetToIdle = useCallback(() => {
    clearTimeout(actionTimer.current)
    setAction(null)
    setMode('idle')
    setExpr('neutral')
    setBlink(false)
    setResetKey(v => v + 1)
  }, [])

  const playAction = useCallback((name, opts = {}) => {
    const sequence = ACTION_SEQ[name]
    if (!sequence) return

    clearTimeout(talkTimer.current)
    clearTimeout(actionTimer.current)

    const duration = opts.duration ?? ACTION_DURATION[name] ?? 1800

    if (opts.manual !== false) {
      manualLockUntil.current = Date.now() + duration + 300
    }

    setMode('action')
    setAction(name)
    setExpr('neutral')
    setBlink(false)
    setResetKey(v => v + 1)

    if (opts.effect) flash(opts.effect, opts.effectMs || 1200)

    if (duration > 0) {
      actionTimer.current = setTimeout(() => {
        setAction(null)
        setMode('idle')
        setExpr('neutral')
        setBlink(false)
        setResetKey(v => v + 1)
      }, duration)
    }
  }, [flash])

  const showExpression = useCallback((name, fx = null, fxMs = 1100) => {
    clearTimeout(talkTimer.current)
    clearTimeout(actionTimer.current)

    const current = visualStateRef.current
    const sameExpression = current.mode === 'idle' && current.expr === name && !current.action

    setAction(null)
    setMode('idle')
    setBlink(false)

    if (!sameExpression) {
      setExpr(name)
      setResetKey(v => v + 1)
    }

    if (fx) flash(fx, fxMs)
  }, [flash])

  const cycleAllActions = useCallback(() => {
    cycleTimers.current.forEach(clearTimeout)
    cycleTimers.current = []
    clearTimeout(actionTimer.current)

    const stepMs = 1500
    manualLockUntil.current = Date.now() + ACTION_ORDER.length * stepMs + 800

    ACTION_ORDER.forEach(([name], index) => {
      cycleTimers.current.push(setTimeout(() => {
        playAction(name, {
          manual: false,
          duration: stepMs - 120
        })
      }, index * stepMs))
    })
  }, [playAction])

  const startPet = useCallback(() => {
    clearPet()
    clearTimeout(talkTimer.current)
    clearTimeout(actionTimer.current)
    setAction(null)
    setMode('pet')
    setExpr('neutral')
    setBlink(false)
    setEffect(null)
    setPetStage(1)
    setResetKey(v => v + 1)
    const times = [250,500,750,1000,1250,1500,1750]
    times.forEach((ms, i) => petTimers.current.push(setTimeout(() => {
      setPetStage(i + 2)
      if (i === 1 || i === 2 || i === 3) setEffect('heart')
      else if (i === 4) setEffect('sparkle')
      else if (i === 5) setEffect('heart')
      else if (i === 6) setEffect('zzz')
    }, ms)))
    petTimers.current.push(setTimeout(() => {
      setPetStage(0)
      setMode('idle')
      setExpr('neutral')
      setEffect(null)
      setResetKey(v => v + 1)
    }, 2400))
  }, [clearPet])

  useEffect(() => {
    if (mode !== 'idle' || voiceStatus !== 'idle') {
      setBlink(false)
      return undefined
    }
    let alive = true
    const schedule = () => {
      blinkTimer.current = setTimeout(() => {
        if (!alive) return
        if (mode !== 'idle') { schedule(); return }
        setBlink(true)
        setResetKey(v => v + 1)
        blinkEnd.current = setTimeout(() => {
          if (!alive) return
          setBlink(false)
          setResetKey(v => v + 1)
        }, 760)
        schedule()
      }, 2600 + Math.random() * 2800)
    }
    schedule()
    return () => {
      alive = false
      clearTimeout(blinkTimer.current)
      clearTimeout(blinkEnd.current)
    }
  }, [mode, voiceStatus])

  useEffect(() => {
    clearTimeout(sleepTimer.current)

    if (mode !== 'idle' || expr !== 'neutral' || voiceStatus !== 'idle') {
      return undefined
    }

    sleepTimer.current = setTimeout(() => {
      playAction('sleep', { manual:false, duration:3200, effect:'zzz', effectMs:2600 })
    }, 22000)

    return () => clearTimeout(sleepTimer.current)
  }, [mode, expr, voiceStatus, playAction])

  useEffect(() => {
    const off = host.onEvent('*', ev => {
      let raw = ''
      try { raw = ev?.type || ev?.method || JSON.stringify(ev) } catch {}
      const s = String(raw).toLowerCase()

      if (Date.now() < manualLockUntil.current) return

      if (/error|fail|exception/.test(s)) {
        showExpression('sad', 'glitch', 1000)
        return
      }

      if (/subagent|delegate|agent/.test(s)) {
        playAction('agent', { manual:false, duration:2600, effect:'data', effectMs:1800 })
        return
      }

      if (/tool|run|exec|call|action/.test(s)) {
        playAction('processing', { manual:false, duration:2200, effect:'scan', effectMs:1600 })
        return
      }

      if (/done|complete|finish|finished|success/.test(s)) {
        playAction('ok', { manual:false, duration:1800, effect:'sparkle', effectMs:1200 })
        return
      }

      if (/stream|token|delta|assistant|message|generat/.test(s)) {
        // IMPORTANT: do not increment resetKey for every streamed token.
        // If THINK is already active, leave it running.
        const current = visualStateRef.current
        if (!(current.mode === 'idle' && current.expr === 'thinking')) {
          showExpression('thinking')
        }
      }
    })

    return typeof off === 'function' ? off : undefined
  }, [playAction, showExpression])

  const sequence = useMemo(() => {
    if (mode === 'pet') return PET

    // Actual voice output must override ordinary visual states.
    if (voiceStatus === 'speaking') return TALK
    if (voiceStatus === 'transcribing' || voiceStatus === 'thinking') return EXPR.thinking
    if (voiceStatus === 'listening' || voiceStatus === 'muted') return IDLE

    if (mode === 'action' && action) return ACTION_SEQ[action] || IDLE
    if (mode === 'talk') return TALK
    if (blink) return BLINK
    if (expr !== 'neutral') return EXPR[expr] || EXPR.neutral
    return IDLE
  }, [mode, action, blink, expr, voiceStatus])

  const fps =
    mode === 'pet' ? 4 :
    voiceStatus === 'speaking' ? 10 :
    (voiceStatus === 'transcribing' || voiceStatus === 'thinking') ? 3 :
    (voiceStatus === 'listening' || voiceStatus === 'muted') ? 4 :
    mode === 'action' && action ? (ACTION_FPS[action] || 3) :
    mode === 'talk' ? 10 :
    blink ? BLINK_FPS :
    mode === 'idle' && expr === 'neutral' ? IDLE_FPS :
    (EXPR_FPS[expr] || 6)

  const loop =
    mode === 'pet' ? false :
    voiceStatus !== 'idle' ? true :
    blink ? false :
    mode === 'action' ||
    mode === 'talk' ||
    mode === 'idle' ||
    expr === 'shake'

  const smooth =
    mode === 'idle' &&
    voiceStatus === 'idle' &&
    !blink &&
    expr !== 'neutral' &&
    sequence.every(f => f.row === 3)

  const label =
    mode === 'pet'
      ? `pet · ${PET_PHASES[Math.max(0, petStage - 1)] || 'idle'}`
      : voiceStatus !== 'idle'
        ? `voice · ${voiceStatus}`
        : mode === 'action'
          ? `action · ${action || 'idle'}`
          : `${mode} · ${expr}`

  const spriteFxNames = new Set(['exclamation','question','idea','heart','sparkle','star','sweat','zzz'])

  return jsxs('div', {
    className:'nivo-wrap',
    children:[
      jsx('style',{children:`
        .nivo-wrap{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:100%;user-select:none}
        .nivo-stage{position:relative;width:96px;height:104px;overflow:visible;cursor:pointer}
        .nivo-character-window{position:absolute;inset:0;width:96px;height:104px;overflow:hidden;background:transparent}
        .nivo-character-canvas{position:absolute;left:0;top:0;width:96px;height:104px;display:block;pointer-events:none;user-select:none;transition:none!important;animation:none!important;transform:translateZ(0)}
        .nivo-fx-window{position:absolute;left:0;top:-20px;width:96px;height:104px;overflow:hidden;pointer-events:none;z-index:20;animation:fxfade 1.1s ease-out both}
        .nivo-fx-canvas{position:absolute;left:0;top:0;width:96px;height:104px;display:block;pointer-events:none;transition:none!important}
        @keyframes fxfade{0%{opacity:0;transform:scale(.9)}15%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.03)}}
        .fx-hover{position:absolute;left:6px;top:1px;width:84px;height:28px;border:2px solid rgba(255,255,255,.7);border-radius:50%;transform:scaleY(.35);animation:pulse 1.2s ease-in-out infinite;pointer-events:none;z-index:19}
        .fx-scan{position:absolute;left:9px;top:0;width:78px;height:78px;border:2px solid rgba(255,255,255,.65);pointer-events:none;z-index:19}
        .fx-scan:before{content:'';position:absolute;left:6px;right:6px;top:36px;height:2px;background:rgba(255,255,255,.85);animation:scan 1s linear infinite}
        .fx-data{position:absolute;left:8px;top:8px;width:80px;height:64px;border:2px solid rgba(255,255,255,.7);padding:8px;box-sizing:border-box;display:flex;flex-direction:column;gap:7px;pointer-events:none;z-index:19}.fx-data i{height:4px;background:rgba(255,255,255,.75)}.fx-data i:nth-child(2){width:65%}.fx-data i:nth-child(4){width:80%}
        .fx-loading{position:absolute;left:23px;top:4px;width:50px;height:50px;display:flex;align-items:center;justify-content:center;font-size:50px;color:rgba(255,255,255,.85);animation:spin 1s linear infinite;pointer-events:none;z-index:19}
        .fx-glitch{position:absolute;left:5px;top:10px;width:86px;height:72px;pointer-events:none;z-index:19}.fx-glitch i{position:absolute;height:6px;background:rgba(255,255,255,.85)}.fx-glitch i:nth-child(1){top:4px;width:70%;left:15%}.fx-glitch i:nth-child(2){top:22px;width:95%}.fx-glitch i:nth-child(3){top:40px;width:55%;left:32%}.fx-glitch i:nth-child(4){top:58px;width:82%;left:6%}
        @keyframes pulse{0%,100%{opacity:.35;transform:scaleY(.3)}50%{opacity:1;transform:scaleY(.5)}}@keyframes scan{0%{opacity:.2;transform:translateY(-28px)}50%{opacity:1}100%{opacity:.2;transform:translateY(28px)}}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        .nivo-status{font-size:10px;color:var(--ui-text-tertiary);opacity:.7;text-transform:capitalize}.nivo-action-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:3px;font-size:9px;font-weight:600;color:var(--ui-text-secondary)}.nivo-all-btn{font-size:9px!important;padding:3px 6px!important}.nivo-action-grid{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.nivo-action-btn{font-size:9px!important;padding:4px 5px!important;text-align:left}.nivo-row{display:flex;flex-wrap:wrap;gap:5px;justify-content:center}.nivo-btn{font-size:10px;padding:4px 7px;border-radius:7px;border:1px solid var(--ui-stroke-secondary);background:var(--ui-bg-elevated,#202025);color:var(--ui-text-secondary,#ddd);cursor:pointer}.nivo-btn:hover{background:var(--ui-bg-hover,#303038)}.nivo-error{width:190px;padding:10px;text-align:center;font-size:10px;line-height:14px;color:var(--ui-text-secondary);border:1px solid var(--ui-stroke-secondary);border-radius:8px}
      `}),
      jsxs('div',{className:'nivo-stage','data-voice':voiceStatus,title:t('petTip'),onClick:()=>{haptic('tap');startPet()},children:[
        assets ? jsx(CharacterSprite,{atlas:assets.character,sequence,fps,loop,resetKey,smooth}) : jsx('div',{className:'nivo-error',children:error||'Sprite-Atlanten werden geladen…'}),
        assets && effect && spriteFxNames.has(effect) ? jsx(FxSprite,{atlas:assets.fx,name:effect}) : null,
        assets && effect && !spriteFxNames.has(effect) ? jsx(CssFx,{name:effect}) : null,
        mode==='pet' && petStage>=5 ? Array.from({length:5},(_,i)=>jsx('span',{key:i,style:{position:'absolute',left:`${25+i*13}%`,top:`${8+(i%2)*10}px`,zIndex:30,color:'#ff7ba8',fontSize:'17px',pointerEvents:'none',animation:`petheart 1.6s ease-out ${i*.1}s both`},children:'♥'})) : null
      ]}),
      jsx('style',{children:'@keyframes petheart{0%{opacity:0;transform:translateY(8px) scale(.5)}25%{opacity:1}100%{opacity:0;transform:translateY(-45px) scale(1.05)}}'}),
      jsx('div',{className:'nivo-status',children:label}),
      jsxs('div',{className:'nivo-row',children:[
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>{clearTimeout(actionTimer.current);clearTimeout(talkTimer.current);setAction(null);setMode('talk');setExpr('neutral');setBlink(false);setResetKey(v=>v+1);talkTimer.current=setTimeout(()=>resetToIdle(),2600)},children:'Talk'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>showExpression('thinking','scan',1500),children:'Think'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>showExpression('excited','sparkle'),children:'Excited'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:startPet,children:'Pet ♥'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>showExpression('curious','question'),children:'?'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>showExpression('thinking','idea'),children:'Idea'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>{showExpression('heart','heart');setTimeout(()=>playAction('hug',{duration:1800}),700)},children:'Heart'}),
        jsx('button',{className:'nivo-btn',type:'button',onClick:()=>showExpression('shake','glitch'),children:'Glitch'})
      ]}),
      jsxs('div',{className:'nivo-action-head',children:[
        jsx('span',{children:'NIVO V5 · ROW 4 · 10 ACTIONS'}),
        jsx('button',{className:'nivo-btn nivo-all-btn',type:'button',onClick:cycleAllActions,children:'▶ ALL 1→10'})
      ]}),
      jsx('div',{
        className:'nivo-action-grid',
        children:ACTION_ORDER.map(([name,label]) =>
          jsx('button',{
            key:name,
            className:'nivo-btn nivo-action-btn',
            type:'button',
            onClick:()=>playAction(name,{
              effect:name==='hug'?'heart':name==='sleep'?'zzz':name==='processing'?'scan':name==='agent'?'data':null,
              effectMs:1600
            }),
            children:label
          })
        )
      })
    ]
  })
}

function AvatarChip(){
  const open = useValue(CHIP_OPEN)
  const t=usePluginI18n(ID)

  return jsxs('div',{style:{position:'relative',height:'100%'},children:[
    jsx('button',{type:'button',className:'px-1.5 text-[0.6875rem] text-(--ui-text-tertiary)',onClick:()=>{haptic('tap');CHIP_OPEN.set(!CHIP_OPEN.get())},title:t('chipTip'),children:'🤖 V5'}),
    open?jsxs('div',{style:{position:'fixed',right:12,bottom:34,zIndex:9999,width:300,padding:12,borderRadius:14,background:'var(--ui-bg-elevated,#1c1c22)',border:'1px solid var(--ui-stroke-secondary)',boxShadow:'0 12px 40px rgba(0,0,0,.45)'},children:[
      jsx(HermesAvatar,{}),
      jsx('button',{type:'button',className:'nivo-btn',style:{position:'absolute',top:6,right:8},onClick:()=>CHIP_OPEN.set(false),children:'✕'})
    ]}):null
  ]})
}

export default {
  id:ID,
  name:'Hermes Avatar — NIVO V5.1 10 Actions',
  register(ctx){
    ctx.i18n.register({
      en:{paneTitle:'Hermes Avatar',petTip:'Click to pet me 💛',chipTip:'Hermes Avatar — click to pet'},
      de:{paneTitle:'Hermes Avatar',petTip:'Klick mich zum Streicheln 💛',chipTip:'Hermes Avatar — zum Streicheln klicken'}
    })
    ctx.register({id:'pane',area:'panes',title:'Hermes Avatar',data:{placement:'right',width:'250px'},render:()=>jsx(HermesAvatar,{})})
    ctx.register({id:'chip',area:'statusBar.right',order:135,render:()=>jsx(AvatarChip,{})})
  }
}
