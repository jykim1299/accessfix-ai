import { useEffect, useState } from 'react';
import type { Case, Dataset } from './types';
import { Arrow, Badge, CaseCard, caseLink, Decision, Model, Notes, Notice } from './common';
import { ActionLog, AllFiles, EvidenceDetail, evidenceViews, type EvidenceView, Patch, repairExplanation, Verification } from './evidence';
import { FeaturedProofCard, ProcessFlow, ProofShowcase, VisualProof } from './visual-proof';

const steps = ['Experience the Problem', 'See the AI Repair', 'See the Difference', 'The Verdict'];
const questions = ['What was broken?', 'What did AI change?', 'Did it really work?', 'Why was it accepted or rejected?'];
function focusHeading(id:string) {
  requestAnimationFrame(() => {
    const heading = document.getElementById(id);
    heading?.focus({preventScroll:true});
    heading?.scrollIntoView({block:'start',behavior:'instant'});
  });
}

export function Dashboard({data}:{data:Dataset}) {
  return <>
    <header className="impact-hero">
      <div><span className="eyebrow">AI repairs. Independent verification decides.</span>
        <h1 tabIndex={-1}>Don't just fix accessibility issues.<br/><em>Prove users can complete their tasks.</em></h1>
        <p>Meta Muse Spark generates accessibility fixes. AccessFix AI tests them in a real browser and rejects unsafe changes.</p>
      </div>
      <a className="button primary impact-primary" href="#/guide">See It in Action <Arrow/></a>
    </header>
    <Notice/>
    <ProofShowcase data={data}/>
    <div className="impact-secondary-links">
      <a className="text-link" href="#/case/tabs">Explore Successful Repair <Arrow/></a>
      <a className="text-link" href="#/case/switch">See Rejected Repair <Arrow/></a>
      <a className="text-link" href="#/evidence">Inspect the Evidence <Arrow/></a>
    </div>
    <section className="impact-process-section" aria-labelledby="overview-process-heading">
      <div className="section-heading"><div><span className="eyebrow">AI generates a fix. AccessFix AI proves whether it works.</span><h2 id="overview-process-heading">How AccessFix AI works</h2></div></div>
      <ProcessFlow/>
    </section>
    <aside className="impact-scope"><strong>Real requests. Saved proof. Bounded experiments.</strong><p>These are recorded results from small, reviewed test cases. Missing measurements and remaining findings stay visible. This demo does not repair arbitrary websites or certify full WCAG conformance.</p></aside>
  </>;
}

export function CaseView({item}:{item:Case}) {
  return <>
    <a className="back-link" href="#/history">All repair results</a>
    <header className="page-heading"><div><span className="eyebrow">{item.kind||'Recorded Meta experiment'}</span><h1 tabIndex={-1}>{item.shortTitle||item.title}</h1><p>{item.summary}</p></div><Badge item={item}/></header>
    <Notice/>
    {['tabs','switch'].includes(item.id)&&<VisualProof item={item}/>}
    <section className="story-split">
      <article><span className="eyebrow">The problem</span><h2>What prevented the user?</h2><p>{item.problem}</p></article>
      <article><span className="eyebrow">The AI repair</span><h2>What changed in the code?</h2><p>{repairExplanation(item)}</p></article>
    </section>
    <details className="judge-technical panel"><summary>Inspect the complete browser verification</summary><Verification item={item} logs={false}/></details>
    <ActionLog item={item}/><Patch item={item}/><Decision item={item}/><Model item={item}/><Notes item={item}/>
    <a className="button secondary" href={`#/evidence/${item.id}`}>Open this case’s proof &amp; code <Arrow/></a>
  </>;
}

export function Guided({data}:{data:Dataset}) {
  const [step,setStep]=useState(0);
  const [selected,setSelected]=useState('tabs');
  const [activePhase,setActivePhase]=useState<'before'|'after'|undefined>(undefined);
  const [eventsOpen,setEventsOpen]=useState(false);
  const item=data.cases.find(item=>item.id===selected)!;
  const changeStep=(next:number)=>{setStep(next);setEventsOpen(false);setActivePhase(undefined);focusHeading('guide-step-heading');};
  const selectCase=(id:string)=>{setSelected(id);setStep(0);setEventsOpen(false);setActivePhase(undefined);};
  return <>
    <header className="page-heading impact-page-heading"><div><span className="eyebrow">AI generates a fix. AccessFix AI proves whether it works.</span><h1 tabIndex={-1}>How It Works</h1><p>See the problem. Inspect the repair. Compare the proof.</p></div></header>
    <Notice/>
    <div className="guide-case-select" role="group" aria-label="Choose a guided case"><span>Follow a case</span><button aria-pressed={selected==='tabs'} onClick={()=>selectCase('tabs')}>Project tabs</button><button aria-pressed={selected==='switch'} onClick={()=>selectCase('switch')}>Notification switch</button></div>
    <ol className="guide-steps">{steps.map((label,index)=><li key={label}><button aria-current={step===index?'step':undefined} onClick={()=>changeStep(index)}><span>Step {index+1}:</span>{' '}{label}</button></li>)}</ol>
    <section className="guided-content impact-guided" aria-labelledby="guide-step-heading" data-guide-step={step+1}>
      <div className="guided-intro"><span className="eyebrow">{questions[step]}</span><h2 id="guide-step-heading" tabIndex={-1}>{steps[step]}</h2></div>
      {step===0&&<>
        <p className="impact-lead">{item.id==='tabs'?'The mouse can open Activity. The keyboard task cannot.':'The switch does not complete the expected keyboard action.'}</p>
        <p className="keyboard-intent">{item.id==='tabs'?<><kbd>Tab</kbd> focuses the original Overview tab. <kbd>ArrowRight</kbd> requests the next tab, but the recorded focus remains on Overview.</>:<><kbd>Tab</kbd> focuses the switch. <kbd>Space</kbd> requests a toggle, but the recorded original task does not complete.</>}</p>
        <VisualProof item={item} beforeOnly/>
        <details className="judge-technical"><summary>Inspect the saved keyboard failure</summary><ActionLog key={`${item.id}-original`} item={item} phase="before"/></details>
        <p className="scope-line">Blocked original workflows left later states unmeasured. Missing evidence is not a pass.</p>
      </>}
      {step===1&&<>
        <div className="ai-change-story"><span className="actor-label">Meta Muse Spark · AI repair</span><h3>{item.id==='tabs'?'Add a keyboard path to the tabs.':'Give the switch native keyboard activation.'}</h3>
          <dl className="repair-explanation"><div><dt>What was broken?</dt><dd>{item.id==='tabs'?'Clicks changed the view, but the keyboard tasks could not reach Activity or Billing.':'The original switch failed the expected keyboard toggle workflows.'}</dd></div>
            <div><dt>What did AI change?</dt><dd>{repairExplanation(item)}</dd></div>
            <div><dt>What should this enable?</dt><dd>{item.id==='tabs'?'Use the keyboard to open a tab, return, and save a note.':'Use the keyboard to change, reset, and save notification settings.'}</dd></div></dl>
          <p className="ai-check-next">A code change is a proposal. The next step checks what actually happened.</p></div>
        <details className="actual-code-disclosure judge-technical panel"><summary>Actual Code Patch <span>Inspect the saved changed lines</span></summary><Patch item={item} preview/></details>
        <Model item={item}/>
      </>}
      {step===2&&<>
        <p className="impact-lead">{item.id==='tabs'?'The same task. A different result.':'Keyboard fixed. Readability broken.'}</p>
        <VisualProof item={item} activePhase={eventsOpen?activePhase:undefined} showKeys={false}/>
        <details className="recorded-events-disclosure judge-technical panel" onToggle={event=>setEventsOpen(event.currentTarget.open)}><summary>Explore recorded keyboard events</summary>
          <div className="proof-phase-explanation"><strong>Connect a saved workflow to its Before or After capture.</strong><p>The highlighted side follows the selected workflow phase. The screenshot is a representative saved state, never a new frame for each key.</p></div>
          <ActionLog key={`${item.id}-comparison`} item={item} onPhaseChange={setActivePhase}/>
        </details>
        <details className="browser-checks-disclosure judge-technical panel"><summary>View detailed browser checks</summary><Verification item={item} logs={false}/></details>
        <p className="scope-line">Recorded browser checks measure completed tasks. axe counts cover observed states; incomplete findings still require review.</p>
      </>}
      {step===3&&<>
        <div className={`judge-verdict-panel ${item.decision}`}><Badge item={item}/><h3>{item.id==='tabs'?'Fixed. Tested. Accepted.':'Keyboard fixed. Readability broken. Rejected.'}</h3><p>{item.id==='tabs'?'Both keyboard tasks completed. Both pointer tasks still worked. No new automated findings appeared in the measured states.':'The saved audit measured 1.19:1 text contrast. AccessFix AI rejected the patch and preserved the original.'}</p></div>
        <details className="judge-technical panel"><summary>Inspect the recorded decision and remaining review</summary><Decision item={item}/><Notes item={item}/></details>
        <a className="text-link" href={`#/evidence/${item.id}`}>Inspect the Evidence <Arrow/></a>
      </>}
      <div className="guide-controls"><button className="button secondary" disabled={step===0} onClick={()=>changeStep(step-1)}>Previous step</button><span>Step {step+1} of 4</span>{step<3?<button className="button primary" onClick={()=>changeStep(step+1)}>Next step <Arrow/></button>:<a className="button primary" href={caseLink(item.id)}>Open the full result <Arrow/></a>}</div>
    </section>
  </>;
}

export function Explorer({data,caseId}:{data:Dataset;caseId?:string}) {
  const [selected,setSelected]=useState(caseId||'tabs');
  const [view,setView]=useState<EvidenceView|null>(null);
  useEffect(()=>{setSelected(caseId||'tabs');setView(null);},[caseId]);
  const item=data.cases.find(item=>item.id===selected)||data.cases[0];
  const changeView=(next:EvidenceView)=>{setView(next);focusHeading('evidence-detail-heading');};
  return <>
    <header className="page-heading impact-page-heading"><div><span className="eyebrow">Technical evidence, when you want it</span><h1 tabIndex={-1}>Proof &amp; Code</h1><p>Choose a question. Open the original record behind the answer.</p></div></header><Notice/>
    <div className="explorer-toolbar"><label htmlFor="case-select">Choose a case</label><select id="case-select" value={item.id} onChange={event=>{setSelected(event.target.value);setView(null);}}>{data.cases.map(item=><option key={item.id} value={item.id}>{item.shortTitle||item.title} — {item.decision==='accepted'?(item.manualReview?'Accepted with review':'Accepted'):'Rejected'}</option>)}</select><Badge item={item}/></div>
    <div className="evidence-priorities" role="group" aria-label="Choose evidence to inspect">{evidenceViews.map((entry,index)=><button key={entry.id} aria-pressed={view===entry.id} onClick={()=>changeView(entry.id)}><span className="evidence-order">0{index+1}</span><strong>{entry.description}</strong><span>{entry.title}</span></button>)}</div>
    {view&&<EvidenceDetail key={`${item.id}-${view}`} item={item} view={view}/>}
    {!view&&<p className="evidence-entry-note">Actual code, measured browser outcomes, and original verdicts. Nothing here runs a repair or changes a source file.</p>}
    <Model item={item}/><AllFiles data={data}/><Notes item={item}/>
  </>;
}

export function History({data}:{data:Dataset}) {
  const featured=data.cases.filter(item=>['tabs','switch'].includes(item.id));
  const more=data.cases.filter(item=>!['tabs','switch'].includes(item.id));
  return <>
    <header className="page-heading impact-page-heading"><div><span className="eyebrow">What actually worked—and what we stopped</span><h1 tabIndex={-1}>Repair Results</h1><p>A working keyboard path matters. So does catching an unsafe change.</p></div></header><Notice/>
    <section className="featured-history" aria-labelledby="featured-history-heading"><div className="section-heading"><h2 id="featured-history-heading">Featured Results</h2></div><div className="feature-proof-grid">{featured.map(item=><FeaturedProofCard key={item.id} item={item}/>)}</div><p className="feature-source-note">Saved original and candidate PNGs, cropped for comparison. The Switch candidate was rejected and never selected as the final result.</p></section>
    <section className="more-experiments" aria-labelledby="more-experiments-heading"><div className="section-heading"><h2 id="more-experiments-heading">More Results</h2><p>Original verdicts, with their limits.</p></div><div className="history-grid">{more.map(item=><CaseCard key={item.id} item={item}/>)}</div></section>
    <aside className="notes"><h2>Accepted does not mean fully accessible.</h2><p>Menu retains review items. Tic Tac Toe’s 16 new incomplete signatures are not 16 confirmed violations. Separate visual review found lost board outlines. These bounded experiments do not establish whole-site WCAG conformance.</p></aside>
  </>;
}
