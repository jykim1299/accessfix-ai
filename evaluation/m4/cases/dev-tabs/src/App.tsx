import React, { useEffect, useState } from 'react';

type View = 'overview' | 'activity' | 'billing';
const views: { id: View; label: string; heading: string; body: string }[] = [
  { id: 'overview', label: 'Overview', heading: 'Project overview', body: 'The Northstar workspace has three active projects.' },
  { id: 'activity', label: 'Activity', heading: 'Recent activity', body: 'The release checklist was updated this morning.' },
  { id: 'billing', label: 'Billing', heading: 'Billing details', body: 'Your workspace is on the monthly Studio plan.' },
];
function initialNotes() {
  try { const n = Number(localStorage.getItem('accessfix.m4.tabs.notes')); return Number.isSafeInteger(n) && n >= 0 ? n : 0; }
  catch { return 0; }
}

export default function App() {
  const [selected, setSelected] = useState<View>('overview');
  const [notes, setNotes] = useState(initialNotes);
  useEffect(() => { localStorage.setItem('accessfix.m4.tabs.notes', String(notes)); }, [notes]);
  return <main>
    <header><p className="eyebrow">NORTHSTAR / PROJECTS</p><h1>Project workspace</h1><p>Choose a view and keep your project notes nearby.</p></header>
    <section className="card" aria-labelledby="views-title">
      <h2 id="views-title">Project views</h2>
      <div role="tablist" aria-label="Project views" className="tab-list">
        {views.map(view => <div key={view.id} id={`tab-${view.id}`} role="tab" tabIndex={selected === view.id ? 0 : -1} aria-selected={selected === view.id} aria-controls={`panel-${view.id}`} onClick={() => setSelected(view.id)}>{view.label}</div>)}
      </div>
      {views.map(view => <section key={view.id} id={`panel-${view.id}`} role="tabpanel" aria-labelledby={`tab-${view.id}`} hidden={selected !== view.id} tabIndex={0} className="view-panel">
        <h3>{view.heading}</h3><p>{view.body}</p>
      </section>)}
    </section>
    <section className="card secondary" aria-labelledby="notes-title"><div><h2 id="notes-title">Workspace notes</h2><p role="status" aria-label="Note count">Notes: {notes}</p></div><button onClick={() => setNotes(value => value + 1)}>Add note</button></section>
    <footer>Demo data stays in this browser.</footer>
  </main>;
}
