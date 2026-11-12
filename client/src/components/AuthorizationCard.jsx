import { ArrowRight, Clock3, ShieldAlert } from 'lucide-react'

function AuthorizationCard() {
  return (
    <article className="authorization-card">
      <div className="authorization-accent" />
      <div className="authorization-content">
        <div className="authorization-title-row">
          <div className="authorization-symbol"><ShieldAlert size={19} /></div>
          <span className="pending-badge"><span /> Pending authorization</span>
          <span className="authorization-time"><Clock3 size={13} /> 4 min ago</span>
        </div>
        <h2>One more step before we continue</h2>
        <p className="authorization-description">The AI assistant needs your approval to search the web for supporting sources. Your workflow is safely paused until you decide.</p>
        <div className="request-box">
          <span className="request-label">REQUESTED ACTION</span>
          <p>Search the web for recent market trends to enrich your Q3 analysis.</p>
          <span className="request-meta">Requested by <strong>Research Assistant</strong><span className="meta-divider">·</span> Thread <code>run_8f2a…c91d</code></span>
        </div>
        <div className="authorization-actions">
          <button className="approve-button">Approve and continue <ArrowRight size={15} /></button>
          <button className="deny-button">Decline</button>
          <span className="pause-note"><span className="pause-dot" /> Workflow paused</span>
        </div>
      </div>
    </article>
  )
}

export default AuthorizationCard
