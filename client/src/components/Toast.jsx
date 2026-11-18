import { useState, useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, Zap, ArrowRight } from 'lucide-react'

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }) {
  const { id, type = 'info', title, message, duration = 6000, meta } = toast
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    if (!duration || duration <= 0) return

    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)

      if (elapsed >= duration) {
        clearInterval(interval)
        onDismiss(id)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [id, duration, onDismiss])

  const icons = {
    warning: <AlertTriangle size={18} className="toast-icon-warning" />,
    failover: <Zap size={18} className="toast-icon-failover" />,
    success: <CheckCircle2 size={18} className="toast-icon-success" />,
    info: <Info size={18} className="toast-icon-info" />,
  }

  const isFailover = type === 'failover' || type === 'warning'

  return (
    <aside className={`toast-card toast-${type} animate-slide-in`} role="alert">
      <div className="toast-header-row">
        <div className="toast-icon-box">
          {icons[type] || icons.info}
        </div>
        <div className="toast-text-area">
          <div className="toast-title-line">
            <strong className="toast-title">{title}</strong>
            {isFailover && <span className="toast-code-badge">HTTP 429</span>}
          </div>
          <p className="toast-message">{message}</p>
          {meta && (
            <div className="toast-meta-row">
              <span className="toast-meta-pill">{meta.primaryModel}</span>
              <ArrowRight size={12} className="toast-meta-arrow" />
              <span className="toast-meta-pill highlight">{meta.fallbackModel}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(id)}
          className="toast-close-btn"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>

      {duration > 0 && (
        <div className="toast-progress-track">
          <div
            className="toast-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </aside>
  )
}

export default ToastContainer
