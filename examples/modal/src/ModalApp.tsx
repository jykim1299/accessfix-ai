import React, { FormEvent, useEffect, useState } from 'react';

type Preferences = { displayName: string; emailUpdates: boolean };
const storageKey = 'accessfix.delivery';
const defaults: Preferences = { displayName: 'Morgan', emailUpdates: true };

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved && typeof saved.displayName === 'string' && typeof saved.emailUpdates === 'boolean') {
      return { displayName: saved.displayName, emailUpdates: saved.emailUpdates };
    }
  } catch { /* A missing or damaged local setting uses the documented default. */ }
  return { ...defaults };
}

export default function ModalApp() {
  const [saved, setSaved] = useState<Preferences>(loadPreferences);
  const [draft, setDraft] = useState<Preferences>(saved);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(0);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, [saved]);

  function openPreferences() {
    setDraft({ ...saved });
    setOpen(true);
  }

  function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved({ ...draft });
    setOpen(false);
  }

  return <main>
    <section className="workspace">
      <header className="page-header">
        <p className="eyebrow">NORTHSTAR / DELIVERY</p>
        <h1>Delivery workspace</h1>
        <p className="intro">Keep your delivery preferences in one place.</p>
      </header>
      <section className="settings-card" aria-labelledby="saved-title">
        <div className="card-heading"><span className="section-number">01</span><h2 id="saved-title">Your preferences</h2></div>
        <p role="status" aria-label="Saved preferences" className="saved-summary">{saved.displayName} · Email updates: {saved.emailUpdates ? 'On' : 'Off'}</p>
        <button className="primary" onClick={openPreferences}>Edit delivery preferences</button>
      </section>
      <section className="draft-card" aria-labelledby="draft-title">
        <div><h2 id="draft-title">Delivery drafts</h2><p>Prepare a new delivery without changing your preferences.</p></div>
        <div className="draft-actions"><p role="status" aria-label="Draft count">{drafts} drafts</p><button className="secondary" onClick={() => setDrafts(count => count + 1)}>Create draft</button></div>
      </section>
      <p className="local-note">Demo data is stored only in this browser.</p>
    </section>

    {open && <div className="modal-backdrop">
      <div className="preferences-dialog" role="dialog" aria-modal="true">
        <p className="eyebrow">WORKSPACE SETTINGS</p>
        <h2 id="preferences-title">Delivery preferences</h2>
        <p id="preferences-description">Choose the name and updates used for your deliveries.</p>
        <form onSubmit={savePreferences}>
          <label className="field-label" htmlFor="display-name">Display name</label>
          <input id="display-name" value={draft.displayName} onChange={event => setDraft({ ...draft, displayName: event.target.value })} />
          <label className="checkbox-row"><input type="checkbox" checked={draft.emailUpdates} onChange={event => setDraft({ ...draft, emailUpdates: event.target.checked })} /><span>Email updates</span></label>
          <div className="dialog-actions"><button className="secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="primary" type="submit">Save preferences</button></div>
        </form>
      </div>
    </div>}
  </main>;
}
