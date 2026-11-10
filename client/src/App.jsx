import { Activity, ArrowDownToLine, ArrowUpRight, CircleHelp, FilePlus2, FileText, LayoutDashboard, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import AuthorizationCard from './components/AuthorizationCard.jsx'
import DocumentList from './components/DocumentList.jsx'
import TokenGauge from './components/TokenGauge.jsx'

const navigation = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'Documents', icon: FileText, count: '12' },
  { label: 'Activity', icon: Activity },
]

const documents = [
  { name: 'Q3 Market Analysis.pdf', meta: 'PDF · 2.4 MB · Added 2 hours ago', status: 'Ready', color: 'violet', initials: 'PDF' },
  { name: 'Customer Interview Notes.docx', meta: 'DOCX · 184 KB · Added yesterday', status: 'Ready', color: 'blue', initials: 'DOC' },
  { name: 'Product Roadmap 2025.pdf', meta: 'PDF · 1.8 MB · Added Oct 21', status: 'Processing', color: 'orange', initials: 'PDF' },
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="WCMIH home">
        <span className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></span>
        <span>work<span className="brand-light">space</span></span>
      </a>

      <div className="workspace-picker">
        <div className="workspace-avatar">A</div>
        <div className="workspace-name"><strong>Acme Studio</strong><span>Personal workspace</span></div>
        <span className="picker-caret">⌄</span>
      </div>

      <p className="nav-caption">WORKSPACE</p>
      <nav className="primary-nav" aria-label="Main navigation">
        {navigation.map(({ label, icon: Icon, active, count }) => (
          <a className={`nav-link${active ? ' active' : ''}`} href="#" key={label}>
            <Icon size={17} strokeWidth={1.8} />
            <span>{label}</span>
            {count && <span className="nav-count">{count}</span>}
          </a>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-tip">
        <div className="tip-icon"><ShieldCheck size={17} /></div>
        <strong>Your data stays yours</strong>
        <p>Documents are encrypted and only accessible to your workspace.</p>
        <a href="#">Learn about security <ArrowUpRight size={13} /></a>
      </div>
      <div className="sidebar-footer">
        <a className="nav-link" href="#"><Settings2 size={17} /><span>Settings</span></a>
        <a className="nav-link" href="#"><CircleHelp size={17} /><span>Help center</span></a>
        <div className="profile-row">
          <div className="profile-avatar">JD</div>
          <div className="profile-name"><strong>Jamie Davis</strong><span>Free plan</span></div>
          <span className="picker-caret">···</span>
        </div>
      </div>
    </aside>
  )
}

function Header() {
  return (
    <header className="topbar">
      <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div>
      <div className="topbar-actions">
        <span className="status-indicator"><span /> All systems operational</span>
        <button className="icon-button" aria-label="Download report"><ArrowDownToLine size={17} /></button>
        <div className="topbar-avatar">JD</div>
      </div>
    </header>
  )
}

function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-panel">
        <Header />
        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">MONDAY, OCTOBER 28, 2024</p>
              <h1>Good morning, Jamie <span className="wave">✦</span></h1>
              <p className="welcome-subtitle">Here’s what’s happening in your workspace today.</p>
            </div>
            <button className="primary-button"><FilePlus2 size={16} /> Add documents</button>
          </section>

          <section className="stats-grid" aria-label="Workspace usage">
            <TokenGauge />
            <article className="stat-card">
              <div className="stat-heading"><span>Documents</span><span className="stat-icon blue-icon"><FileText size={17} /></span></div>
              <div className="stat-value">12 <span className="stat-context">total files</span></div>
              <div className="stat-foot"><span className="trend-positive">+3</span> added this week</div>
              <div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </article>
            <article className="stat-card activity-card">
              <div className="stat-heading"><span>Agent activity</span><span className="stat-icon green-icon"><Activity size={17} /></span></div>
              <div className="stat-value">8 <span className="stat-context">tasks this week</span></div>
              <div className="stat-foot"><span className="trend-positive">+2</span> from last week</div>
              <div className="activity-sparkline" aria-hidden="true"><svg viewBox="0 0 220 36" preserveAspectRatio="none"><path d="M1 30 C18 26, 19 29, 34 22 S56 28, 72 17 S96 26, 110 16 S132 24, 148 11 S168 20, 183 8 S203 15, 219 3" /></svg></div>
            </article>
          </section>

          <section className="dashboard-grid">
            <div className="content-column">
              <AuthorizationCard />
              <DocumentList documents={documents} />
            </div>
            <aside className="right-column">
              <article className="activity-panel">
                <div className="section-heading"><div><h2>Recent activity</h2><p>Your workspace at a glance</p></div><button className="text-button">View all <ArrowUpRight size={14} /></button></div>
                <div className="timeline">
                  <div className="timeline-item"><span className="timeline-icon violet-icon"><Sparkles size={15} /></span><div><p><strong>Insights generated</strong></p><span>Market Analysis · 2 hours ago</span></div></div>
                  <div className="timeline-item"><span className="timeline-icon blue-icon"><FileText size={15} /></span><div><p><strong>Document uploaded</strong></p><span>Q3 Market Analysis.pdf · 2 hours ago</span></div></div>
                  <div className="timeline-item"><span className="timeline-icon green-icon"><ShieldCheck size={15} /></span><div><p><strong>Authorization approved</strong></p><span>Product brief summary · Yesterday</span></div></div>
                </div>
                <div className="activity-footer"><span className="activity-dot" /> Everything is up to date</div>
              </article>
              <article className="upgrade-card">
                <span className="upgrade-icon"><Sparkles size={16} /></span>
                <h3>Make more room for ideas</h3>
                <p>Upgrade your plan for more tokens, documents, and deeper insights.</p>
                <button className="upgrade-button">Explore plans <ArrowUpRight size={14} /></button>
                <div className="upgrade-decoration" aria-hidden="true">✦</div>
              </article>
            </aside>
          </section>
          <footer className="page-footer">WCMIH <span>·</span> Your AI-powered workspace</footer>
        </div>
      </main>
    </div>
  )
}

export default App
