import type { Case, Dataset, EvidenceImage } from './types';
import { Arrow, caseLink } from './common';
import './judge-impact.css';

const evidenceUrl = (path: string) => './' + path.replace(/^\/+/, '');
const resultRatio = (passed: number | null, total: number | null) =>
  passed == null || total == null ? 'Not measured' : `${passed}/${total}`;

function ProofIcon({ kind }: { kind: 'check' | 'stop' | 'inspect' | 'code' | 'browser' }) {
  const paths = {
    check: 'M4 12 9 17 20 6',
    stop: 'M7 7 17 17 M17 7 7 17',
    inspect: 'M15.5 15.5 21 21 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    code: 'M8 6 2 12 8 18 M16 6 22 12 16 18 M14 3 10 21',
    browser: 'M3 4h18v16H3z M3 8h18 M7 14l3 3 7-6',
  };
  return <svg className="impact-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d={paths[kind]} />
  </svg>;
}

function ProofCapture({
  item, phase, image, activePhase, concise = false,
}: { item: Case; phase: 'before' | 'after'; image: EvidenceImage; activePhase?: 'before' | 'after'; concise?: boolean }) {
  const isBefore = phase === 'before';
  const isSwitch = item.id === 'switch';
  const title = isSwitch
    ? (isBefore ? 'Off label is readable' : 'Off label is hard to read')
    : (isBefore ? 'Keyboard task blocked' : 'Keyboard task completed');
  const description = isSwitch
    ? (isBefore ? 'Original “Off” label' : 'Candidate “Off” label · 1.19:1')
    : (isBefore ? 'The saved task stays on Overview.' : 'The saved task reaches Activity.');

  return <figure className={`impact-capture impact-capture-${phase}`} data-selected-phase={activePhase === phase ? 'true' : undefined}>
    <figcaption>
      <span className="impact-phase">{isBefore ? 'Before · original' : isSwitch ? 'After · rejected AI candidate' : 'After · AI candidate'}</span>
      <strong>{title}</strong>
      {activePhase === phase && <span className="impact-selected-phase">Selected workflow phase</span>}
    </figcaption>
    <a
      className={`impact-crop impact-crop-${isSwitch ? 'switch' : 'tabs'}`}
      href={evidenceUrl(image.src)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open original PNG: ${isBefore ? 'before' : 'after'} ${item.shortTitle || item.title}`}
    >
      <img src={evidenceUrl(image.src)} alt={image.caption} />
    </a>
    {!concise && <p>{description}</p>}
  </figure>;
}

export function VisualProof({
  item, beforeOnly = false, compact = false, activePhase, showKeys = true,
}: { item: Case; beforeOnly?: boolean; compact?: boolean; activePhase?: 'before' | 'after'; showKeys?: boolean }) {
  const isSwitch = item.id === 'switch';
  const before = isSwitch ? item.images.contrastBefore || item.images.before : item.images.before;
  const after = isSwitch ? item.images.contrastAfter || item.images.after : item.images.after;
  const originalRecord = item.keyboardLog.find(record =>
    record.phase === 'before' && (isSwitch || record.taskId === 'keyboard-activity'),
  ) || item.keyboardLog.find(record => record.phase === 'before');
  const recordedKeys = originalRecord?.entries?.filter(entry => entry.kind === 'key' && entry.key).map(entry => entry.key!) || [];
  const beforeScore = resultRatio(item.metrics.before.keyboardPass, item.metrics.before.keyboardTotal);
  const afterScore = resultRatio(item.metrics.after.keyboardPass, item.metrics.after.keyboardTotal);

  return <div className={`impact-proof ${compact ? 'impact-proof-compact' : ''} ${beforeOnly ? 'impact-proof-original' : ''}`}>
    <div className="impact-proof-heading">
      <div>
        <span className="impact-kicker">{beforeOnly ? 'The original browser evidence' : 'Real saved browser evidence'}</span>
        <h3>{beforeOnly ? 'The keyboard task is blocked.' : isSwitch ? 'A fix that should not ship.' : 'See the task become possible.'}</h3>
      </div>
      {!beforeOnly && <span className={`impact-verdict ${isSwitch ? 'impact-rejected' : 'impact-accepted'}`}>
        <ProofIcon kind={isSwitch ? 'stop' : 'check'} />{isSwitch ? 'Rejected' : 'Accepted'}
      </span>}
    </div>
    {showKeys && <div className="impact-key-record">
      <span>Original recorded keys</span>
      <div>{recordedKeys.map((key, index) => <kbd key={`${index}-${key}`}>{key === ' ' ? 'Space' : key}</kbd>)}</div>
      {originalRecord?.source && <a href={evidenceUrl(originalRecord.source)} target="_blank" rel="noreferrer">Inspect key log</a>}
    </div>}
    <div className={`impact-capture-pair ${beforeOnly ? 'impact-single-capture' : ''}`}>
      <ProofCapture item={item} image={before} phase="before" activePhase={activePhase} />
      {!beforeOnly && <ProofCapture item={item} image={after} phase="after" activePhase={activePhase} />}
    </div>
    <div className={`impact-result-bar ${isSwitch && !beforeOnly ? 'impact-result-rejected' : ''}`}>
      <div className="impact-task-score">
        <span>Keyboard tasks completed</span>
        <strong>{beforeScore}{!beforeOnly && <><span>to</span>{afterScore}</>}</strong>
      </div>
      <div className="impact-result-explanation">
        {beforeOnly ? <>
          <strong>The original keyboard task did not complete.</strong>
          <p>Pointer tasks completed: {resultRatio(item.metrics.before.pointerPass, item.metrics.before.pointerTotal)}. Later states blocked by the keyboard failure remain unmeasured.</p>
        </> : isSwitch ? <>
          <strong>Keyboard fixed. Readability broken.</strong>
          <p className="contrast-proof"><b>Contrast: <span>1.19:1</span></b><span>Below the applicable <b>4.5:1</b> threshold.</span></p>
          <p>AccessFix AI rejected the patch and preserved the original.</p>
        </> : <>
          <strong>Pointer tasks: {resultRatio(item.metrics.after.pointerPass, item.metrics.after.pointerTotal)} maintained.</strong>
          <p>No new axe violations or incomplete findings observed in the measured states.</p>
        </>}
      </div>
    </div>
    <p className="impact-source-note">{isSwitch ? 'Saved screenshots of the same initial state.' : 'Saved screenshots of different recorded states.'} Crop and border for presentation; original PNGs unchanged. Key logs and screenshots are separate evidence, not a frame-by-frame replay.</p>
  </div>;
}

export function FeaturedProofCard({ item }: { item: Case }) {
  const isSwitch = item.id === 'switch';
  const before = isSwitch ? item.images.contrastBefore || item.images.before : item.images.before;
  const after = isSwitch ? item.images.contrastAfter || item.images.after : item.images.after;
  return <article className={`feature-proof-card ${isSwitch ? 'feature-rejected' : 'feature-accepted'}`} data-case={item.id}>
    <header className="feature-proof-header">
      <div><span className="feature-proof-kicker">{isSwitch ? 'Unsafe repair caught' : 'Successful repair'}</span><h3>{item.shortTitle || item.title}</h3></div>
      <span className={`impact-verdict ${isSwitch ? 'impact-rejected' : 'impact-accepted'}`}><ProofIcon kind={isSwitch ? 'stop' : 'check'}/>{isSwitch ? 'Rejected' : 'Accepted'}</span>
    </header>
    <div className="impact-capture-pair">
      <ProofCapture item={item} phase="before" image={before} concise/>
      <ProofCapture item={item} phase="after" image={after} concise/>
    </div>
    <div className="feature-proof-metrics">
      <div className="feature-keyboard"><span>Keyboard tasks</span><strong>{resultRatio(item.metrics.before.keyboardPass,item.metrics.before.keyboardTotal)} <span>to</span> {resultRatio(item.metrics.after.keyboardPass,item.metrics.after.keyboardTotal)}</strong></div>
      {isSwitch ? <div className="feature-contrast"><span>New confirmed contrast violation</span><strong>1.19:1</strong><span>Below 4.5:1</span></div> : <div className="feature-pointer"><strong>Pointer {resultRatio(item.metrics.after.pointerPass,item.metrics.after.pointerTotal)}</strong><span>maintained</span></div>}
    </div>
    <p className="feature-decision"><ProofIcon kind={isSwitch ? 'stop' : 'check'}/><strong>{isSwitch ? 'Rejected — original preserved' : 'Accepted on the measured checks'}</strong></p>
    <a className="text-link feature-result-link" href={caseLink(item.id)}>Explore this result <Arrow/></a>
  </article>;
}

export function ProofShowcase({ data }: { data: Dataset }) {
  return <section className="impact-showcase" aria-labelledby="impact-showcase-heading">
    <div className="impact-showcase-top">
      <div><span className="impact-kicker">The result is the demo</span><h2 id="impact-showcase-heading">One repair accepted. One unsafe change stopped.</h2></div>
    </div>
    <div className="feature-proof-grid">{data.cases.filter(item=>['tabs','switch'].includes(item.id)).map(item=><FeaturedProofCard key={item.id} item={item}/>)}</div>
    <p className="feature-source-note">Saved original and AI-candidate screenshots; crops for presentation only. Tabs shows different recorded states. Switch shows the same initial state. Original PNGs unchanged.</p>
  </section>;
}

export function ProcessFlow() {
  const stages = [
    { title: 'Website Problem', description: 'Observe a keyboard user’s task and record the original failure.', icon: 'inspect' as const },
    { title: 'Meta Muse Spark — AI Repair', description: 'Meta Muse Spark proposes an actual code patch for that task.', icon: 'code' as const },
    { title: 'AccessFix AI — Independent Browser Verification', description: 'Check keyboard outcomes, pointer behavior, and accessibility regressions.', icon: 'browser' as const },
  ];
  return <section className="impact-process" aria-labelledby="impact-process-heading">
    <div className="impact-process-heading"><span className="impact-kicker">How the decision is made</span><h2 id="impact-process-heading">The model writes. The browser proves.</h2></div>
    <ol className="impact-process-stages">
      {stages.map((stage, index) => <li key={stage.title}>
        <div className="impact-stage-symbol"><ProofIcon kind={stage.icon} /><span>0{index + 1}</span></div>
        <h3>{stage.title}</h3><p>{stage.description}</p>
      </li>)}
    </ol>
    <div className="impact-decision-branches" role="group" aria-label="Two possible verification decisions">
      <div className="impact-branch impact-branch-accepted"><ProofIcon kind="check" /><div><h3>Accept the measured improvement</h3><p>The task works and the required checks pass.</p></div></div>
      <div className="impact-branch impact-branch-rejected"><ProofIcon kind="stop" /><div><h3>Reject the unsafe change</h3><p>A regression or unresolved requirement keeps the original in place.</p></div></div>
    </div>
  </section>;
}
