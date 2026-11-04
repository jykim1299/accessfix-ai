import React, { useEffect, useState } from 'react';

type DraftState = { status: 'Active' | 'Archived'; copies: number; drafts: number };
function initialState(): DraftState {
  try {
    const value = JSON.parse(localStorage.getItem('accessfix.m4.menu') || 'null');
    if (value && ['Active', 'Archived'].includes(value.status) && Number.isSafeInteger(value.copies) && value.copies >= 0 && Number.isSafeInteger(value.drafts) && value.drafts >= 1) return value;
  } catch {}
  return { status: 'Active', copies: 0, drafts: 1 };
}

export default function App() {
  const [state, setState] = useState(initialState);
  const [open, setOpen] = useState(false);
  useEffect(() => { localStorage.setItem('accessfix.m4.menu', JSON.stringify(state)); }, [state]);
  function choose(action: 'duplicate' | 'archive') {
    setState(current => action === 'duplicate' ? { ...current, copies: current.copies + 1 } : { ...current, status: 'Archived' });
    setOpen(false);
  }
  return <main>
    <header><p className="eyebrow">NORTHSTAR / DRAFTS</p><h1>Draft workspace</h1><p>Manage your delivery draft and create the next one.</p></header>
    <section className="card" aria-labelledby="draft-title">
      <h2 id="draft-title">Current draft</h2>
      <dl><div><dt>Status</dt><dd role="status" aria-label="Draft status">{state.status}</dd></div><div><dt>Copies</dt><dd role="status" aria-label="Copy count">Copies: {state.copies}</dd></div></dl>
      <div className="menu-container">
        <button id="workspace-actions" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'draft-actions' : undefined} onClick={() => setOpen(value => !value)}>Workspace actions</button>
        {open && <div id="draft-actions" role="menu" aria-labelledby="workspace-actions" className="menu">
          <button role="menuitem" tabIndex={-1} onClick={() => choose('duplicate')}>Duplicate draft</button>
          <button role="menuitem" tabIndex={-1} onClick={() => choose('archive')}>Archive draft</button>
        </div>}
      </div>
    </section>
    <section className="card secondary" aria-labelledby="queue-title"><div><h2 id="queue-title">Delivery queue</h2><p role="status" aria-label="Draft count">Drafts: {state.drafts}</p></div><button onClick={() => setState(current => ({ ...current, drafts: current.drafts + 1 }))}>Create draft</button></section>
    <footer>Demo data stays in this browser.</footer>
  </main>;
}
