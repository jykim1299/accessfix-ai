import React, { useEffect, useState } from 'react';

function initialSummary() {
  try { return localStorage.getItem('accessfix.m4.switch.weekly') === 'true'; }
  catch { return false; }
}

export default function App() {
  const [saved, setSaved] = useState(initialSummary);
  const [draft, setDraft] = useState(saved);
  const [tests, setTests] = useState(0);
  useEffect(() => { localStorage.setItem('accessfix.m4.switch.weekly', String(saved)); }, [saved]);
  return <main>
    <header><p className="eyebrow">NORTHSTAR / NOTIFICATIONS</p><h1>Notification settings</h1><p>Choose the updates you want, then save your preferences.</p></header>
    <section className="card" aria-labelledby="delivery-title">
      <h2 id="delivery-title">Delivery updates</h2>
      <div className="setting-row"><div><h3 id="weekly-label">Weekly summary</h3><p id="weekly-description">Receive one digest of your workspace activity each week.</p></div>
        <div className="switch" role="switch" tabIndex={0} aria-label="Weekly summary" aria-describedby="weekly-description" aria-checked={draft} onClick={() => setDraft(value => !value)} onKeyDown={event => { if (event.key === ' ') { event.preventDefault(); setDraft(value => !value); } }} onKeyUp={event => { if (event.key === ' ') { event.preventDefault(); setDraft(value => !value); } }}><span aria-hidden="true">{draft ? 'On' : 'Off'}</span></div>
      </div>
      <p role="status" aria-label="Saved notification settings">Weekly summary: {saved ? 'On' : 'Off'}</p>
      <div className="actions"><button className="muted-button" onClick={() => setDraft(saved)}>Reset changes</button><button onClick={() => setSaved(draft)}>Save settings</button></div>
    </section>
    <section className="card secondary" aria-labelledby="test-title"><div><h2 id="test-title">Delivery check</h2><p role="status" aria-label="Test notification count">Test notifications: {tests}</p></div><button onClick={() => setTests(value => value + 1)}>Send test notification</button></section>
    <footer>Saved preferences stay in this browser.</footer>
  </main>;
}
