'use client';

import { useEffect, useState } from 'react';

const formatTime = (ms = 0) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function SourceLink({ href, children }) {
  return <a className="source-link" href={href} target="_blank" rel="noreferrer">{children || 'Open official source ↗'}</a>;
}

function sourceHost(href) {
  try {
    return new URL(href).hostname;
  } catch {
    return 'Open official source ↗';
  }
}

export default function OpportunitiesPage() {
  const [password, setPassword] = useState('');
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!job?.id || !['running'].includes(job.status)) return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/opportunities/jobs/${job.id}`, { cache: 'no-store' });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || 'Could not read agent progress.');
        if (alive) setJob(next);
      } catch (pollError) {
        if (alive) setError(pollError.message);
      }
    };
    poll();
    const timer = window.setInterval(poll, 1200);
    return () => { alive = false; window.clearInterval(timer); };
  }, [job?.id, job?.status]);

  const refresh = async (event) => {
    event.preventDefault();
    setError(''); setIsStarting(true);
    try {
      const response = await fetch('/api/opportunities/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not start the agent.');
      setPassword('');
      setJob({ id: body.id, status: 'running', searches: 0, pageReads: 0, elapsedMs: 0, toolCalls: [] });
    } catch (startError) {
      setError(startError.message);
    } finally {
      setIsStarting(false);
    }
  };

  const cancel = async () => {
    if (!job?.id) return;
    try {
      const response = await fetch(`/api/opportunities/jobs/${job.id}/cancel`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not cancel the job.');
      setJob(body);
    } catch (cancelError) { setError(cancelError.message); }
  };

  const phase = !job ? 'Ready to research' : job.status === 'running' && job.pageReads === 0 ? 'Searching for matches' : job.status === 'running' ? 'Reading official sources' : job.status === 'completed' ? 'Checking complete' : job.status;
  const results = job?.results;

  return <main className="opportunities-shell">
    <header className="game-header opportunity-header"><a className="brand" href="/"><i />George Lyu</a><nav className="game-nav" aria-label="Main menu"><a href="/">HOME</a><a className="active" href="/opportunities">OPPORTUNITIES</a></nav></header>
    <section className="opportunity-hero"><p className="kicker">PERSONAL RESEARCH DESK</p><h1>Find your next<br/><em>good idea.</em></h1><p>Fresh opportunities matched to your interests. Every recommendation must be checked against an official source.</p></section>
    <section className="opportunity-grid">
      <aside className="research-panel"><p className="panel-label">OPPORTUNITY RADAR</p><h2>Run a search</h2><p className="muted">Your password unlocks a one-time search. Results stay in this browser and are never saved.</p><form onSubmit={refresh}><label htmlFor="site-password">Site password</label><input id="site-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Enter password" autoComplete="current-password"/><button className="primary-action" disabled={isStarting || job?.status === 'running'}>{isStarting ? 'Starting…' : 'Refresh opportunities'}</button></form>{error && <p className="error-message" role="alert">{error}</p>}</aside>
      <section className="live-panel" aria-live="polite"><div className="live-heading"><div><p className="panel-label">LIVE ACTIVITY</p><h2>{phase}</h2></div>{job?.status === 'running' && <button className="cancel-action" type="button" onClick={cancel}>Cancel</button>}</div>{job ? <><div className="meter"><i style={{ width: `${Math.min(100, (job.searches + job.pageReads) * 7)}%` }} /></div><div className="progress-stats"><span><b>{job.searches}</b> searches</span><span><b>{job.pageReads}</b> sources read</span><span><b>{formatTime(job.elapsedMs)}</b> elapsed</span></div>{job.error && <p className="error-message" role="alert">Search failed: {job.error}</p>}<details className="tool-log"><summary>Show real agent activity ({job.toolCalls?.length || 0})</summary><ol>{job.toolCalls?.map((call, index) => <li key={`${call.at}-${index}`}><strong>{call.tool === 'web_search' ? 'Searching' : call.tool === 'open_page' ? 'Reading source' : 'Checking matches'}</strong>{call.url && <> — <SourceLink href={call.url}>{sourceHost(call.url)}</SourceLink></>}{call.status && <small>{call.status}</small>}</li>)}</ol></details></> : <p className="empty-state">Enter your site password to start. You’ll see each search and official source as the agent works.</p>}</section>
    </section>
    {results && <section className="results-wrap"><div className="results-intro"><p className="kicker">RESEARCH REPORT</p><h2>What the agent could <em>prove.</em></h2><p>{results.profileConsidered}</p></div><div className="result-columns"><div><h3>Verified opportunities <span>{results.verified?.length || 0}</span></h3>{results.verified?.length ? results.verified.map((item) => <article className="opportunity-card" key={item.name}><h4>{item.name}</h4><p>{item.whyItFits}</p><p className="location">{item.location}</p><div className="evidence"><strong>Eligibility</strong><q>{item.eligibilityEvidence.excerpt}</q><SourceLink href={item.eligibilityEvidence.url} /><strong>Availability</strong><q>{item.availabilityEvidence.excerpt}</q><SourceLink href={item.availabilityEvidence.url} /></div></article>) : <p className="empty-state">No opportunities met every evidence requirement in this run.</p>}</div><div><h3>Not recommended <span>{(results.inconclusive?.length || 0) + (results.rejected?.length || 0)}</span></h3>{[...(results.inconclusive || []), ...(results.rejected || [])].map((item) => <article className="ruled-card" key={`${item.name}-${item.reason}`}><h4>{item.name}</h4><p>{item.reason}</p><div>{item.sourcesChecked?.map((source) => <SourceLink href={source} key={source} />)}</div></article>)}</div></div></section>}
  </main>;
}
