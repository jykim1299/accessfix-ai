import React, {useRef,useState} from 'react';
import type {Artifact} from './types';

// Keep every original artifact reachable without clipping hundreds of links in
// a nested scroller. This changes presentation only, never the evidence bytes.
export function EvidenceFiles({files}:{files:Artifact[]}) {
  const [page,setPage]=useState(0);
  const status=useRef<HTMLParagraphElement>(null);
  const size=12;
  const pages=Math.max(1,Math.ceil(files.length/size));
  const current=Math.min(page,pages-1);
  const first=current*size;
  const visible=files.slice(first,first+size);
  function change(next:number){
    setPage(next);
    // Moving to the status preserves keyboard focus when Next becomes disabled.
    requestAnimationFrame(()=>status.current?.focus());
  }
  return <div className="evidence-files">
    <div className="artifact-pagination">
      <p ref={status} tabIndex={-1} role="status" className="artifact-count">
        {files.length?`${first+1}–${Math.min(first+size,files.length)} / ${files.length} evidence files · Page ${current+1}/${pages}`:'0 evidence files'}
      </p>
      {pages>1&&<div className="artifact-page-buttons">
        <button className="button secondary small" aria-label="Previous evidence page" disabled={current===0} onClick={()=>change(current-1)}>Previous</button>
        <button className="button secondary small" aria-label="Next evidence page" disabled={current===pages-1} onClick={()=>change(current+1)}>Next</button>
      </div>}
    </div>
    <div className="artifact-list">
      {visible.map(f=><div className="artifact-row" key={`${f.kind}-${f.path}`}>
        <span><strong>{f.kind==='analyses'?'Original analysis':'Repair candidate'}</strong><code>{f.path}</code></span>
        {f.preview_url&&<a href={f.preview_url} target="_blank" rel="noreferrer" className="text-link">View<span className="sr-only"> {f.path} (opens in a new tab)</span></a>}
        <a href={f.url} className="text-link">Download<span className="sr-only"> {f.path}</span></a>
      </div>)}
    </div>
  </div>;
}
