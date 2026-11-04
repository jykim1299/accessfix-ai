import { useEffect, useId, useState } from 'react';
import type { Case, Dataset, EvidenceFile, EvidenceImage, RecordedAction, RecordedCheck } from './types';
import { Arrow, asset, Compare, Decision, MetricStrip, text } from './common';

export function TaskTable({ item }: { item: Case }) {
  return <div className="task-list" role="table" aria-label="Recorded task completion">
    <div className="task-list-head" role="row">
      <span role="columnheader">Tested user task</span><span role="columnheader">Before</span><span role="columnheader">After</span>
    </div>
    {item.tasks.map((task, index) => <div className="task-row" role="row" key={`${task.id}-${index}`}>
      <div role="rowheader"><strong>{task.name}</strong><span className="task-mode">{task.mode}</span></div>
      {[['Before', task.beforePassed], ['After', task.afterPassed]].map(([phase, passed]) =>
        <span role="cell" key={String(phase)} className={`task-result ${passed === true ? 'pass' : passed === false ? 'fail' : ''}`}>
          <span className="task-state-label">{phase}</span>
          {passed === true ? 'Completed' : passed === false ? 'Blocked' : 'Not included'}
        </span>,
      )}
    </div>)}
  </div>;
}

function WorkflowChecks({ checks, item }: { checks: RecordedCheck[]; item: Case }) {
  return <details className="workflow-checks">
    <summary>Inspect recorded workflow checks <span>{checks.length} stored checks</span></summary>
    <p className="caption">These checks describe the whole selected task, not the selected key event. Stored statuses and values are shown without recalculating the original verdict.</p>
    {item.id === 'menu' && <p className="record-caveat">Some Menu checks were stored as pass even though a serialized drafts value differs. The original record is preserved; this viewer does not resolve that discrepancy.</p>}
    <ul className="check-list">
      {checks.map((check, index) => <li key={`${check.id}-${index}`}>
        <div><code>{check.id}</code><strong className={`check-status ${check.status}`}>{check.status === 'missing' ? 'Not measured' : `Recorded ${check.status}`}</strong></div>
        {check.status !== 'missing' && <dl>
          <div><dt>Expected</dt><dd>{text(check.expected)}</dd></div>
          <div><dt>Observed</dt><dd>{text(check.actual)}</dd></div>
        </dl>}
      </li>)}
    </ul>
  </details>;
}

const initialEvent = (record: RecordedAction | undefined) =>
  record?.phase === 'before' ? Math.max(0, (record.entries?.length || 1) - 1) : 0;

export function ActionLog({ item, phase, onPhaseChange }: { item: Case; phase?: 'before' | 'after'; onPhaseChange?: (phase:'before'|'after')=>void }) {
  const log = item.keyboardLog.filter(record => !phase || record.phase === phase);
  const [workflowIndex, setWorkflowIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(() => initialEvent(log[0]));
  const selectId = useId();
  useEffect(() => {
    setWorkflowIndex(0);
    setEventIndex(initialEvent(item.keyboardLog.find(record => !phase || record.phase === phase)));
  }, [item.id, phase]);
  const record = log[workflowIndex] || log[0];
  useEffect(() => { if (record?.phase) onPhaseChange?.(record.phase); }, [record?.phase, onPhaseChange]);
  const task = item.tasks.find(task => task.id === record?.taskId);
  const checks = (record?.phase === 'before' ? task?.beforeChecks : task?.afterChecks) || [];
  const events = record?.entries || [];
  const event = events[eventIndex] || events[0];

  const selectWorkflow = (index: number) => {
    setWorkflowIndex(index);
    setEventIndex(initialEvent(log[index]));
  };

  return <section className="panel action-log" aria-label="Recorded keyboard task evidence">
    <div className="section-heading">
      <div><span className="eyebrow">Recorded interaction</span><h3>Follow the recorded keyboard task.</h3></div>
      <span className="small-label">Saved evidence · no live playback</span>
    </div>
    {record ? <>
      <div className="record-selector">
        <label htmlFor={selectId}>Recorded workflow</label>
        <select id={selectId} value={workflowIndex} onChange={event => selectWorkflow(Number(event.target.value))}>
          {log.map((entry, index) => <option value={index} key={`${entry.phase}-${entry.taskId}`}>{entry.label}</option>)}
        </select>
      </div>
      <div className="workflow-result" aria-live="polite" aria-atomic="true">
        <span>{record.phase === 'before' ? 'Original' : 'Candidate'} workflow result</span>
        <strong className={record.passed === true ? 'pass-text' : record.passed === false ? 'fail-text' : ''}>{text(record.actual)}</strong>
        <p>{task?.name || record.label}</p>
      </div>
      {event ? <>
        <h4>Recorded key events</h4>
        <p className="caption">Select a saved key event to inspect its recorded focus. This list contains key events only; it is not a frame-by-frame replay or a complete action log.</p>
        <ol className="event-picker" aria-label="Recorded key events">
          {events.map((entry, index) => <li key={index}>
            <button type="button" aria-pressed={index === eventIndex} onClick={() => setEventIndex(index)}>
              <span>Event {index + 1}</span><kbd>{entry.key || entry.kind}</kbd>
            </button>
          </li>)}
        </ol>
        <div className="event-detail" aria-live="polite" aria-atomic="true">
          <h4>Selected event {eventIndex + 1}: {event.key || event.kind}</h4>
          <dl>
            <div><dt>Focused element / text</dt><dd>{event.focus?.text == null ? 'Not recorded' : event.focus.text || 'No text content'}</dd></div>
            <div><dt>Element and recorded role</dt><dd>{event.focus?.tag || 'Not recorded'} · {event.focus?.role || 'No explicit role recorded'}</dd></div>
            <div><dt>Recorded aria-label</dt><dd>{event.focus ? (event.focus.name || 'Not explicitly set') : 'Not recorded'}</dd></div>
            {event.focus?.inDialog != null && <div><dt>Focus inside a dialog</dt><dd>{event.focus.inDialog ? 'Yes' : 'No'}</dd></div>}
            <div><dt>Time since workflow start</dt><dd>{event.elapsed_s == null ? 'Not recorded' : `${event.elapsed_s.toFixed(3)} s`}</dd></div>
          </dl>
          <p className="caption">No screenshot or task result is inferred from this event index.</p>
        </div>
      </> : <p>Detailed key events are not included for this workflow.</p>}
      {checks.length > 0 && <WorkflowChecks item={item} checks={checks} />}
      <div className="log-controls">
        <button className="button secondary" disabled={workflowIndex === 0} onClick={() => selectWorkflow(workflowIndex - 1)}>Previous recorded workflow</button>
        <span>Workflow {workflowIndex + 1} of {log.length}</span>
        <button className="button secondary" disabled={workflowIndex === log.length - 1} onClick={() => selectWorkflow(workflowIndex + 1)}>Next recorded workflow</button>
      </div>
      {record.source && <a className="text-link source-link" href={asset(record.source)} target="_blank" rel="noreferrer">Open the original workflow record <Arrow /></a>}
    </> : <p>Detailed key events are not included in this public evidence copy. Aggregate task outcomes remain available; no input sequence has been recreated.</p>}
  </section>;
}

function Diff({ value, changedOnly = false }: { value: string; changedOnly?: boolean }) {
  // Normalize line endings for display only. The downloadable patch is untouched.
  const allLines = value.split(/\r+\n|\r|\n/);
  const lines = changedOnly ? allLines.filter(line => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line)) : allLines;
  return <pre className="diff-view" role="region" tabIndex={0} aria-label={changedOnly ? 'Actual changed lines from the recorded patch' : 'Full recorded patch'}><code>
    {lines.map((line, index) => <span key={index} className={`diff-line ${line.startsWith('+') && !line.startsWith('+++') ? 'diff-added' : line.startsWith('-') && !line.startsWith('---') ? 'diff-removed' : ''}`}>{line || ' '}{'\n'}</span>)}
  </code></pre>;
}

export function repairExplanation(item: Case) {
  return item.id === 'switch'
    ? 'The patch replaces a clickable div with a native button while retaining the switch role and click behavior. This gives the control native keyboard activation. It contains no CSS edit; the button inherits different text styling, which must also be checked in the browser.'
    : item.repairExplanation;
}

export function Patch({ item, preview = false }: { item: Case; preview?: boolean }) {
  const patchFile = item.files.find(file => file.kind === 'patch');
  return <section className="panel patch-panel">
    {preview && <>
      <span className="eyebrow">Actual Meta-generated code</span>
      <h3>What changed in the patch?</h3>
      <p>{repairExplanation(item)}</p>
      <p className="diff-legend"><span>Lines beginning with + were added.</span><span>Lines beginning with − were removed.</span></p>
      <Diff value={item.patch} changedOnly />
    </>}
    <details className="full-patch">
      <summary>View the full recorded patch</summary>
      <p>This is the actual saved model patch, including context lines. It cannot be applied from this viewer.</p>
      <Diff value={item.patch} />
    </details>
    {patchFile && <a className="text-link source-link" href={asset(patchFile.path)} target="_blank" rel="noreferrer">Open the original patch file <Arrow /></a>}
  </section>;
}

export function ContrastCrops({ item }: { item: Case }) {
  const captures: [string, EvidenceImage][] = [
    ['Before · original', item.images.contrastBefore || item.images.before],
    ['After · rejected candidate', item.images.contrastAfter || item.images.after],
  ];
  return <section className="panel contrast-panel">
    <span className="eyebrow">Look closer at the saved captures</span>
    <h2>The same switch, magnified.</h2>
    <p>These are 2× crops of the original screenshot files. The image pixels and historical evidence are unchanged.</p>
    <div className="contrast-crops">
      {captures.map(([label, image]) => <figure key={label}>
        <figcaption>{label}</figcaption>
        <a className="contrast-crop" href={asset(image.src)} target="_blank" rel="noreferrer" aria-label={`Open full screenshot: ${label}`}>
          <img src={asset(image.src)} alt={`Magnified stored screenshot of the switch: ${label}`} />
        </a>
      </figure>)}
    </div>
    <p className="caption">The candidate’s white “Off” text sits on a pale background. The preserved axe audit measured 1.19:1, below the 4.5:1 requirement.</p>
  </section>;
}

export function SwitchExplanation() {
  return <section className="rejection-explainer">
    <div>
      <span className="eyebrow">Improvement and regression, together</span>
      <h2>AI fixed keyboard access, but made the text harder to read. AccessFix AI rejected the patch.</h2>
      <p>The original was preserved. A successful keyboard task does not make a new readability failure acceptable.</p>
    </div>
    <div className="contrast-measure"><strong>1.19:1</strong><span>Measured text contrast</span><span>Required: 4.5:1</span></div>
  </section>;
}

export function Verification({ item, logs = true }: { item: Case; logs?: boolean }) {
  return <>
    <MetricStrip item={item} />
    <p className="verification-summary">{item.id === 'switch'
      ? 'Both keyboard tasks now complete and both pointer tasks still work. The browser audit also found a new text contrast violation: 1.19:1.'
      : item.id === 'tabs'
        ? 'Both keyboard tasks now complete and both pointer tasks still work. No new axe violations or incomplete findings appeared in the measured states.'
        : 'Compare the completed tasks and the recorded accessibility findings together. Existing findings and incomplete checks remain part of the evidence.'}</p>
    <Compare item={item} />
    <section className="panel">
      <h3>Did users complete their tasks?</h3>
      <p>The saved browser checks measure completed tasks and existing pointer behavior. Sending a key is not counted as task completion.</p>
      <TaskTable item={item} />
    </section>
    <div className="measurement-note">
      <strong>Read the scope with the numbers.</strong>
      <p>These axe counts cover observed states. Original keyboard failures stopped some workflows before all intended states were reached. Zero observed findings does not establish full accessibility. Incomplete findings need review and are not confirmed violations.</p>
    </div>
    {logs && <ActionLog item={item} />}
  </>;
}

export function FileList({ files }: { files: EvidenceFile[] }) {
  return <div className="file-list">
    {files.map(file => <div className="file-row" key={file.path}>
      <div>
        <strong>{file.label}</strong><span>{file.kind} · {file.derived ? 'Derived public summary' : 'Preserved public file'}</span>
        <details><summary>File SHA-256</summary><code className="hash">{file.sha256}</code></details>
      </div>
      <div className="file-actions">
        <a className="text-link" href={asset(file.path)} target="_blank" rel="noreferrer" aria-label={`Open ${file.label}`}>Open <Arrow /></a>
        <a className="text-link" href={asset(file.path)} download aria-label={`Download ${file.label}`}>Download</a>
      </div>
    </div>)}
  </div>;
}

export function AllFiles({ data }: { data: Dataset }) {
  const total = data.cases.reduce((sum, item) => sum + item.files.length, 0);
  return <details className="all-evidence-files panel">
    <summary>View all {total} evidence files <span>{data.cases.length} recorded cases · original files and labeled summaries</span></summary>
    <p>Every reviewed public file remains available. Derived summaries are labeled separately from preserved original files.</p>
    {data.cases.map(item => <section className="case-file-group" key={item.id}>
      <h3>{item.shortTitle || item.title} <span>({item.files.length} files)</span></h3>
      <FileList files={item.files} />
    </section>)}
  </details>;
}

export const evidenceViews = [
  { id: 'patch', title: 'Actual AI Patch', description: 'What code did Meta AI change?' },
  { id: 'verification', title: 'Browser Verification', description: 'Did the browser tests pass?' },
  { id: 'decision', title: 'Final Decision', description: 'Why was the patch accepted or rejected?' },
] as const;
export type EvidenceView = typeof evidenceViews[number]['id'];

export function primaryFiles(item: Case, view: EvidenceView) {
  const names = view === 'patch' ? ['patch.diff'] : view === 'decision' ? ['decision.json'] :
    item.id === 'tictactoe' ? ['recorded-summary.json', 'audits.json'] :
      item.id === 'switch' ? ['after-tasks.json', 'contrast-audit.json'] : ['after-tasks.json', 'audits.json'];
  return item.files.filter(file => names.some(name => file.path.endsWith('/' + name)));
}

export function EvidenceDetail({ item, view }: { item: Case; view: EvidenceView }) {
  return <section className="evidence-detail" aria-labelledby="evidence-detail-heading">
    <h2 id="evidence-detail-heading" tabIndex={-1}>{evidenceViews.find(entry => entry.id === view)?.title}</h2>
    {view === 'patch' && <Patch item={item} preview />}
    {view === 'verification' && <Verification item={item} />}
    {view === 'decision' && <Decision item={item} />}
    <div className="panel supporting-records"><h3>Open the supporting record</h3><FileList files={primaryFiles(item, view)} /></div>
  </section>;
}
