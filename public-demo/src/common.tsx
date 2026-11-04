import type { Case, EvidenceImage } from './types';

export const asset = (path: string) => './' + path.replace(/^\/+/, '');
export const caseLink = (id: string) => `#/case/${encodeURIComponent(id)}`;
export const text = (value: unknown) => value == null
  ? 'Not recorded'
  : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
export const ratio = (pass: number | null, total: number | null) =>
  pass == null || total == null ? 'Not measured' : `${pass}/${total}`;
export const count = (value: number | null) => value == null ? 'Not measured' : String(value);

export function Arrow() {
  return <svg className="link-arrow" aria-hidden="true" focusable="false" viewBox="0 0 16 16">
    <path d="M4 12 12 4 M4 4h8v8" />
  </svg>;
}

export function StatusIcon({ accepted = true }: { accepted?: boolean }) {
  return <svg className="status-icon" aria-hidden="true" focusable="false" viewBox="0 0 16 16">
    <path d={accepted ? 'M3 8.2 6.2 11.4 13 4.6' : 'M4 4 12 12 M12 4 4 12'} />
  </svg>;
}

export function BrandMark() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32">
    <path d="M7 24 15 7 22 24 M10.5 18H19" />
    <path d="M18 23 22 27 29 18" />
  </svg>;
}

export function Badge({ item }: { item: Case }) {
  const style = item.decision === 'accepted' ? (item.manualReview ? 'review' : 'accepted') : 'rejected';
  return <span className={`badge ${style}`}>
    <StatusIcon accepted={item.decision === 'accepted'} />
    {item.decision === 'accepted' ? (item.manualReview ? 'Accepted · review remains' : 'Accepted') : 'Rejected'}
  </span>;
}

export function Notice() {
  return <p className="recorded-note">
    <span className="recorded-dot" aria-hidden="true" />
    Recorded results from actual Meta API requests — No live model calls
  </p>;
}

export function ImageView({ image, label }: { image: EvidenceImage; label: string }) {
  return <figure className="evidence-image">
    <figcaption><strong>{label}</strong><span>{image.caption}</span></figcaption>
    <a href={asset(image.src)} target="_blank" rel="noreferrer" aria-label={`Open full-size ${label.toLowerCase()} screenshot`}>
      <img src={asset(image.src)} alt={image.caption || `${label} evidence screenshot`} loading="lazy" />
    </a>
    <span className="image-hint">Open the original capture <Arrow /></span>
  </figure>;
}

export function Compare({ item }: { item: Case }) {
  return <div className="comparison">
    <ImageView image={item.images.before} label="Before · original" />
    <ImageView image={item.images.after} label="After · AI candidate" />
  </div>;
}

export function MetricStrip({ item }: { item: Case }) {
  const { before, after } = item.metrics;
  const metrics = [
    ['Keyboard tasks', ratio(before.keyboardPass, before.keyboardTotal), ratio(after.keyboardPass, after.keyboardTotal), 'Actual task completion'],
    ['Pointer tasks', ratio(before.pointerPass, before.pointerTotal), ratio(after.pointerPass, after.pointerTotal), 'Existing behavior checked'],
    ['axe violations', count(before.violations), count(after.violations), 'Measured state–nodes'],
    ['axe incomplete', count(before.incomplete), count(after.incomplete), 'Needs further review'],
  ];
  return <div className="metric-strip" role="group" aria-label="Recorded before and after measurements">
    {metrics.map(([label, first, second, hint]) => <div key={label}>
      <span>{label}</span><strong>{first} <i>to</i> {second}</strong><small>{hint}</small>
    </div>)}
  </div>;
}

export function CaseCard({ item }: { item: Case }) {
  return <article className="case-card">
    <div className="card-top">
      <span className="eyebrow">{item.id === 'tabs' ? 'A repair that works' : item.id === 'switch' ? 'A change we stopped' : item.kind || 'Recorded experiment'}</span>
      <Badge item={item} />
    </div>
    <h3><a href={caseLink(item.id)}>{item.shortTitle || item.title}</a></h3>
    <p>{item.summary}</p>
    {item.id === 'menu' && <p className="case-caveat">15 violation and 2 incomplete state–nodes remain. Manual review is still required.</p>}
    {item.id === 'tictactoe' && <p className="case-caveat">New incomplete signatures triggered rejection. They are not confirmed violations; separate visual review found lost board outlines.</p>}
    <div className="case-number">
      {item.id === 'switch' ? <><strong>1.19:1</strong><span>New text contrast violation</span></> : <>
        <strong>{ratio(item.metrics.before.keyboardPass, item.metrics.before.keyboardTotal)} <span>to</span> {ratio(item.metrics.after.keyboardPass, item.metrics.after.keyboardTotal)}</strong>
        <span>Keyboard tasks completed</span>
      </>}
    </div>
    <a className="text-link" href={caseLink(item.id)}>{item.decision === 'rejected' ? 'Understand the rejection' : 'Explore the repair'} <Arrow /></a>
  </article>;
}

export function Notes({ item }: { item: Case }) {
  return <aside className="notes">
    <h3>Scope and remaining review</h3>
    <ul>{item.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
  </aside>;
}

export function Model({ item }: { item: Case }) {
  return <details className="model-disclosure">
    <summary>Model and request details <span>Saved experiment metadata</span></summary>
    <dl className="model-facts">
      <div><dt>Recorded model</dt><dd><code>{item.model.id}</code></dd></div>
      <div><dt>Actual API requests</dt><dd>{item.model.requests ?? 'Not recorded'}</dd></div>
      <div><dt>Tokens</dt><dd>{item.model.tokens?.toLocaleString('en-US') ?? 'Not recorded'}</dd></div>
      <div><dt>Response time</dt><dd>{item.model.seconds == null ? 'Not recorded' : `${item.model.seconds.toFixed(3)} s`}</dd></div>
      <div><dt>Automatic retries</dt><dd>{item.model.automaticRetries ?? 'Not recorded'}</dd></div>
      <div><dt>Cost</dt><dd>{item.model.costUsd == null ? 'Not recorded; no estimate' : `$${item.model.costUsd}`}</dd></div>
      {item.model.recordedAt && <div><dt>Recorded at</dt><dd><time dateTime={item.model.recordedAt}>{item.model.recordedAt}</time></dd></div>}
    </dl>
    <p className="caption">Opening these details does not call the model. Historical model IDs and request counts are unchanged.</p>
  </details>;
}

export function Decision({ item }: { item: Case }) {
  return <section className={`decision-panel ${item.decision}`}>
    <div>
      <span className="eyebrow">Recorded independent decision</span>
      <h2>{item.decision === 'accepted' ? (item.manualReview ? 'Accepted, with remaining review.' : 'Accepted on the measured criteria.') : 'Rejected. Original preserved.'}</h2>
      <p>{item.decisionExplanation}</p>
    </div>
    <Badge item={item} />
  </section>;
}
