import { Zap } from 'lucide-react'

function TokenGauge() {
  return (
    <article className="stat-card token-card">
      <div className="stat-heading"><span>Token usage</span><span className="stat-icon amber-icon"><Zap size={17} /></span></div>
      <div className="token-total">24,800 <span>/ 50,000</span></div>
      <div className="token-progress" role="progressbar" aria-label="Token usage" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100">
        <span />
      </div>
      <div className="token-caption"><span>50% used</span><span>Resets in 12 days</span></div>
    </article>
  )
}

export default TokenGauge
