import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Dataset } from './types';
import { BrandMark } from './common';
import { CaseView, Dashboard, Explorer, Guided, History } from './pages';
import { release } from './release';
import './styles.css';
import './rc2.css';
import './judge-impact.css';
import './judge-pages.css';
import './rc4.css';

const navItems = [
  ['/', 'Overview'],
  ['/guide', 'How It Works'],
  ['/history', 'Repair Results'],
  ['/evidence', 'Proof & Code'],
];

function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(location.hash.slice(1) || '/');

  useEffect(() => {
    let active = true;
    fetch('./data/cases.json')
      .then(response => {
        if (!response.ok) throw new Error('Evidence data could not be loaded.');
        return response.json();
      })
      .then(value => { if (active) setData(value); })
      .catch(reason => { if (active) setError(String(reason.message)); });

    const change = () => {
      setRoute(location.hash.slice(1) || '/');
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
    };
    window.addEventListener('hashchange', change);
    return () => { active = false; window.removeEventListener('hashchange', change); };
  }, []);

  useEffect(() => {
    const title = route.startsWith('/case/')
      ? data?.cases.find(item => item.id === route.split('/')[2])?.shortTitle
      : route.startsWith('/guide') ? 'How It Works'
        : route.startsWith('/evidence') ? 'Proof & Code'
          : route === '/history' ? 'Repair Results' : 'Overview';
    document.title = `${title || 'Recorded Demo'} · AccessFix AI`;
  }, [route, data]);

  let content;
  if (error) {
    content = <section className="panel" role="alert"><h1 tabIndex={-1}>Evidence is unavailable.</h1><p>{error}</p><p>Run this built static site using the documented local server.</p></section>;
  } else if (!data) {
    content = <section className="loading"><h1 tabIndex={-1}>Loading the recorded evidence…</h1><p>No model request is being made.</p></section>;
  } else if (route === '/guide') {
    content = <Guided data={data} />;
  } else if (route.startsWith('/case/')) {
    const item = data.cases.find(item => item.id === route.split('/')[2]);
    content = item ? <CaseView key={item.id} item={item} /> : <section className="panel"><h1 tabIndex={-1}>Case not found.</h1><a href="#/history">Browse the recorded cases</a></section>;
  } else if (route.startsWith('/evidence')) {
    content = <Explorer data={data} caseId={route.split('/')[2]} />;
  } else if (route === '/history') {
    content = <History data={data} />;
  } else if (route === '/') {
    content = <Dashboard data={data} />;
  } else {
    content = <section className="panel"><h1 tabIndex={-1}>Page not found.</h1><a href="#/">Return to Dashboard</a></section>;
  }

  return <>
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault();
      document.getElementById('main-content')?.focus();
    }}>Skip to main content</a>
    <header className="site-header">
      <a className="brand" href="#/"><span className="brand-mark"><BrandMark /></span><span>AccessFix <b>AI</b></span></a>
      <nav aria-label="Main navigation">
        {navItems.map(([path, label]) => <a key={path} href={`#${path}`} aria-current={(path === '/' ? route === '/' : route.startsWith(path)) ? 'page' : undefined}>{label}</a>)}
      </nav>
      <span className="header-status"><span className="status-dot" aria-hidden="true" /> Read-only demo</span>
    </header>
    <main id="main-content" tabIndex={-1}>{content}</main>
    <footer>
      <a className="brand footer-brand" href="#/">AccessFix <b>AI</b></a>
      <p>Independent browser verification. Evidence-based decisions.</p>
      <p className="release-status">{release.status} {release.version} · {release.deployment}</p>
      <a href="#/evidence">Proof &amp; Code</a>
    </footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
