import { ArrowUpRight, MoreHorizontal } from 'lucide-react'

function DocumentList({ documents }) {
  return (
    <section className="documents-panel">
      <div className="section-heading">
        <div><h2>Your documents</h2><p>Files your assistant can work with</p></div>
        <button className="text-button">View all <ArrowUpRight size={14} /></button>
      </div>
      <div className="document-list">
        {documents.map((document) => (
          <article className="document-row" key={document.name}>
            <div className={`file-icon ${document.color}-file`}>{document.initials}</div>
            <div className="document-info"><strong>{document.name}</strong><span>{document.meta}</span></div>
            <span className={`document-status ${document.status === 'Ready' ? 'ready' : 'processing'}`}><span />{document.status}</span>
            <button className="row-menu" aria-label={`More options for ${document.name}`}><MoreHorizontal size={18} /></button>
          </article>
        ))}
      </div>
      <button className="all-documents-button">Browse all documents <ArrowUpRight size={14} /></button>
    </section>
  )
}

export default DocumentList
