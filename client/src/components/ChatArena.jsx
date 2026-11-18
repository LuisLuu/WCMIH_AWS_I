import { useState, useRef, useEffect } from 'react'
import {
  Sparkles,
  Send,
  Square,
  Bot,
  User,
  Zap,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Cpu,
  Clock,
  CheckCircle2,
  ChevronRight
} from 'lucide-react'
import { ToastContainer } from './Toast.jsx'

const INITIAL_MESSAGES = [
  {
    id: 'msg_init',
    role: 'assistant',
    content: "Welcome to the **Chat Arena**! Here you can test real-time agent responses, observe streaming tokens chunk-by-chunk, inspect automated **429 rate-limit failovers**, and test prompt cancellation on demand.",
    model: 'Claude 3.5 Sonnet (Anthropic)',
    status: 'ready',
    timestamp: 'Just now'
  }
]

const QUICK_PROMPTS = [
  { label: '⚡ Test 429 Failover', prompt: 'Simulate 429 rate limit failover and continue stream with fallback model.' },
  { label: '🏛️ AWS Architecture', prompt: 'Analyze WCMIH AWS architecture, KMS envelope encryption, and PostgreSQL pooling.' },
  { label: '📊 Database & Telemetry', prompt: 'Summarize the Telemetry_Logs migration schema and smoke test events.' }
]

export default function ChatArena() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [simulateFailover, setSimulateFailover] = useState(false)
  const [activeModel, setActiveModel] = useState('Claude 3.5 Sonnet (Anthropic)')
  const [streamStatus, setStreamStatus] = useState('Idle')
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [toasts, setToasts] = useState([])
  const [copiedId, setCopiedId] = useState(null)
  
  const abortControllerRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom of messages smoothly
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamStatus])

  // Helper to add toast
  const addToast = (toastData) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    setToasts((prev) => [...prev, { ...toastData, id }])
  }

  const dismissToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  // Handle Copy Message Content
  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Clear Conversation
  const handleClear = () => {
    if (isStreaming) {
      handleStopGenerating()
    }
    setMessages(INITIAL_MESSAGES)
    setStreamStatus('Idle')
    setActiveModel('Claude 3.5 Sonnet (Anthropic)')
  }

  // Stop Generating - Calls /cancel API and aborts fetch stream
  const handleStopGenerating = async () => {
    if (!isStreaming) return

    setStreamStatus('Cancelling...')
    
    // 1. Abort client-side fetch connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // 2. Call backend /cancel endpoint
    const sessionIdToCancel = currentSessionId
    try {
      // Try root /cancel or /api/cancel
      await fetch('/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdToCancel })
      }).catch(async () => {
        // Fallback to /api/chat/cancel if needed
        await fetch('/api/chat/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdToCancel })
        })
      })
    } catch (err) {
      console.warn('Cancel API call error:', err)
    }

    // 3. Update UI state
    setIsStreaming(false)
    setStreamStatus('Stopped by user')

    // Append cancellation note to the current assistant message
    setMessages((prev) => {
      const updated = [...prev]
      const lastIndex = updated.length - 1
      if (lastIndex >= 0 && updated[lastIndex].role === 'assistant') {
        const lastMsg = updated[lastIndex]
        updated[lastIndex] = {
          ...lastMsg,
          content: lastMsg.content + '\n\n*(Generation stopped by user)*',
          status: 'cancelled'
        }
      }
      return updated
    })

    addToast({
      type: 'info',
      title: 'Generation Cancelled',
      message: 'The agent stream was successfully halted via /cancel API.',
      duration: 3500
    })
  }

  // Send message and stream SSE chunks
  const handleSubmit = async (promptToSend) => {
    const promptText = (typeof promptToSend === 'string' ? promptToSend : input).trim()
    if (!promptText || isStreaming) return

    const userMessageId = `user_${Date.now()}`
    const assistantMessageId = `asst_${Date.now()}`
    const sessionId = `arena_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

    const userMessage = {
      id: userMessageId,
      role: 'user',
      content: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const assistantPlaceholder = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      model: simulateFailover ? 'Claude 3.5 Sonnet (Anthropic)' : activeModel,
      status: 'connecting',
      tokens: null,
      failedOver: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder])
    setInput('')
    setIsStreaming(true)
    setCurrentSessionId(sessionId)
    setStreamStatus('Connecting...')

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          prompt: promptText,
          sessionId,
          simulateFailover,
          model: activeModel,
          fallbackModel: 'GPT-4o (OpenAI)'
        }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`SSE endpoint responded with status ${response.status}`)
      }

      setStreamStatus('Streaming incoming chunks...')

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let currentEvent = 'message'

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last incomplete fragment in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) {
            // Empty line marks end of an SSE event
            currentEvent = 'message'
            continue
          }

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim()
            continue
          }

          if (trimmed.startsWith('data:')) {
            const rawData = trimmed.slice(5).trim()
            try {
              const data = JSON.parse(rawData)

              // 1. Connection Event
              if (currentEvent === 'connected') {
                setActiveModel(data.primaryModel || activeModel)
              }

              // 2. Status Event
              else if (currentEvent === 'status') {
                setStreamStatus(data.message || data.status)
              }

              // 3. Chunk Event - Stream incoming text chunk smoothly
              else if (currentEvent === 'chunk') {
                const delta = data.delta || ''
                const chunkModel = data.model
                setStreamStatus('Streaming incoming chunks...')
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: m.content + delta,
                          status: 'streaming',
                          model: chunkModel || m.model,
                        }
                      : m
                  )
                )
              }

              // 4. Failover Event (429 Rate Limit) - Display toast & update state
              else if (currentEvent === 'failover' || data.code === 429) {
                const fallback = data.fallbackModel || 'GPT-4o (OpenAI)'
                const primary = data.primaryModel || 'Claude 3.5 Sonnet'
                setActiveModel(fallback)
                setStreamStatus(`Failed over to ${fallback} (HTTP 429)`)

                // Mark message as failed over
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          failedOver: true,
                          fallbackModel: fallback,
                          primaryModel: primary,
                        }
                      : m
                  )
                )

                // Trigger Failover Toast Notification
                addToast({
                  type: 'failover',
                  title: '429 Rate Limit Failover',
                  message: `Primary provider rate limit (429) detected. Seamlessly failed over to ${fallback} without dropping connection.`,
                  duration: 7500,
                  meta: {
                    primaryModel: primary,
                    fallbackModel: fallback,
                  }
                })
              }

              // 5. Done Event
              else if (currentEvent === 'done') {
                setStreamStatus('Completed')
                setIsStreaming(false)
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          status: 'completed',
                          tokens: data.tokenUsage,
                          durationMs: data.durationMs,
                        }
                      : m
                  )
                )
              }

              // 6. Cancelled Event
              else if (currentEvent === 'cancelled') {
                setStreamStatus('Cancelled')
                setIsStreaming(false)
              }
            } catch (jsonErr) {
              // Non-JSON SSE data fallback
              if (rawData && currentEvent === 'chunk') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + rawData, status: 'streaming' }
                      : m
                  )
                )
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user')
      } else {
        console.error('SSE Stream error:', err)
        setStreamStatus('Error in stream')
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: m.content || `*Error connecting to agent stream: ${err.message}*`,
                  status: 'error',
                }
              : m
          )
        )
        addToast({
          type: 'warning',
          title: 'Connection Issue',
          message: `Unable to stream from /api/chat/stream: ${err.message}`,
          duration: 5000
        })
      }
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }

  return (
    <div className="chat-arena-container">
      {/* Toast Notification Container for 429 Failover & System Events */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Arena Top Toolbar / Status Header */}
      <header className="arena-header">
        <div className="arena-header-left">
          <div className="arena-badge-icon">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="arena-title-row">
              <h2 className="arena-title">Chat Arena</h2>
              <span className={`arena-status-pill ${isStreaming ? 'streaming' : 'idle'}`}>
                <span className="status-dot" />
                {streamStatus}
              </span>
            </div>
            <p className="arena-subtitle">Real-time SSE agent streaming with automatic 429 failover orchestration</p>
          </div>
        </div>

        <div className="arena-header-controls">
          {/* 429 Failover Simulation Toggle */}
          <label className={`failover-toggle ${simulateFailover ? 'active' : ''}`} title="Simulate a 429 Rate Limit error from the primary model to test automatic failover">
            <input
              type="checkbox"
              checked={simulateFailover}
              onChange={(e) => {
                setSimulateFailover(e.target.checked)
                if (e.target.checked) {
                  addToast({
                    type: 'info',
                    title: '429 Failover Simulation Armed',
                    message: 'Next prompt will trigger a 429 rate limit failover from Claude 3.5 Sonnet to GPT-4o.',
                    duration: 4000
                  })
                }
              }}
            />
            <Zap size={14} className={simulateFailover ? 'text-amber-500' : ''} />
            <span>Simulate 429 Failover</span>
          </label>

          {/* Model Display Badge */}
          <div className="model-chip" title="Current active inference model">
            <Cpu size={14} />
            <span>{activeModel}</span>
          </div>

          {/* Clear Button */}
          <button
            type="button"
            className="arena-icon-btn"
            onClick={handleClear}
            title="Clear Chat Arena"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      </header>

      {/* Messages Stream Window */}
      <section className="arena-stream-window" aria-label="Conversation stream">
        <div className="arena-messages-list">
          {messages.map((msg) => (
            <article
              key={msg.id}
              className={`arena-message-item ${msg.role === 'user' ? 'user-msg' : 'assistant-msg'}`}
            >
              <div className="msg-avatar-wrapper">
                {msg.role === 'user' ? (
                  <div className="msg-avatar user-avatar">
                    <User size={15} />
                  </div>
                ) : (
                  <div className="msg-avatar bot-avatar">
                    <Bot size={15} />
                  </div>
                )}
              </div>

              <div className="msg-content-bubble">
                <div className="msg-header-line">
                  <span className="msg-sender-name">
                    {msg.role === 'user' ? 'You' : 'Workspace AI Agent'}
                  </span>
                  {msg.role === 'assistant' && msg.model && (
                    <span className="msg-model-tag">
                      {msg.model}
                    </span>
                  )}
                  {msg.failedOver && (
                    <span className="msg-failover-badge animate-pulse" title="Automatic 429 rate limit failover triggered">
                      <Zap size={11} /> 429 Failover Active
                    </span>
                  )}
                  <span className="msg-time">{msg.timestamp}</span>
                </div>

                <div className="msg-body-text">
                  {msg.content}
                  {msg.status === 'streaming' && (
                    <span className="streaming-cursor" aria-hidden="true">▊</span>
                  )}
                </div>

                {/* Message Footnotes / Metrics */}
                {msg.role === 'assistant' && (
                  <div className="msg-footer-bar">
                    {msg.tokens && (
                      <div className="msg-metrics">
                        <span>Tokens: <strong>{msg.tokens.totalTokens}</strong></span>
                        <span className="metric-sep">·</span>
                        <span>Prompt: {msg.tokens.promptTokens}</span>
                        <span className="metric-sep">·</span>
                        <span>Completion: {msg.tokens.completionTokens}</span>
                        {msg.durationMs && (
                          <>
                            <span className="metric-sep">·</span>
                            <span><Clock size={11} className="inline mr-1" />{msg.durationMs}ms</span>
                          </>
                        )}
                      </div>
                    )}
                    {msg.content && (
                      <button
                        type="button"
                        className="msg-copy-btn"
                        onClick={() => handleCopy(msg.id, msg.content)}
                        title="Copy response"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check size={12} className="text-green-500" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy size={12} /> Copy
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </section>

      {/* Suggested Quick Prompts */}
      <div className="arena-quick-prompts">
        <span className="quick-prompts-label">Suggested:</span>
        {QUICK_PROMPTS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            className="quick-prompt-pill"
            disabled={isStreaming}
            onClick={() => {
              if (item.prompt.includes('429')) {
                setSimulateFailover(true)
              }
              handleSubmit(item.prompt)
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Input Bar & Stop Generating Action */}
      <footer className="arena-input-section">
        <form
          className="arena-input-box"
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
        >
          <textarea
            ref={inputRef}
            className="arena-textarea"
            rows={2}
            value={input}
            placeholder={
              isStreaming
                ? "Agent is streaming tokens in real time..."
                : "Type your query or instruction (e.g. 'Test 429 failover' or 'Analyze architecture')..."
            }
            disabled={isStreaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />

          <div className="arena-input-actions">
            <div className="arena-input-info">
              {simulateFailover ? (
                <span className="failover-notice">
                  <Zap size={13} className="text-amber-500 inline mr-1" />
                  429 Failover test mode enabled
                </span>
              ) : (
                <span className="input-hint">
                  Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for new line
                </span>
              )}
            </div>

            <div className="action-buttons-group">
              {/* STOP GENERATING BUTTON - Bound to /cancel API */}
              {isStreaming ? (
                <button
                  type="button"
                  className="stop-generating-button"
                  onClick={handleStopGenerating}
                  aria-label="Stop generating response"
                >
                  <Square size={13} className="fill-current" />
                  <span>Stop Generating</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-button"
                  disabled={!input.trim()}
                  aria-label="Send message"
                >
                  <span>Send</span>
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </form>
      </footer>
    </div>
  )
}
