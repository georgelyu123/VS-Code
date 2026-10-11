'use client';

import { useCallback, useEffect, useState } from 'react';

const formatTime = (ms = 0) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

function SourceLink({ href }) {
  return <a className="source-link" href={href} target="_blank" rel="noreferrer">Open official source ↗</a>;
}

function OpportunityCard({ opportunity, controls, onDecision, isUpdating }) {
  return <article className="opportunity-card">
    <p className="card-status">{opportunity.status}</p>
    <h4>{opportunity.title}</h4>
    {opportunity.why_it_fits && <p>{opportunity.why_it_fits}</p>}
    {opportunity.source_excerpt && <blockquote>{opportunity.source_excerpt}</blockquote>}
    <SourceLink href={opportunity.url} />
    {controls && <div className="decision-actions">
      <button className="primary-action" type="button" disabled={isUpdating} onClick={() => onDecision('approved')}>Approve</button>
      <button className="cancel-action" type="button" disabled={isUpdating} onClick={() => onDecision('rejected')}>Reject</button>
    </div>}
  </article>;
}

export default function OpportunitiesPage() {
  const [password, setPassword] = useState('');
  const [approved, setApproved] = useState([]);
  const [newOpportunities, setNewOpportunities] = useState([]);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const loadApproved = useCallback(async () => {
    const response = await fetch('/api/opportunities', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load approved opportunities.');
    setApproved(body.opportunities || []);
  }, []);

  const loadNew = useCallback(async () => {
    const response = await fetch('/api/opportunities/new', {
      cache: 'no-store',
      headers: { 'x-site-password': password },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load new opportunities.');
    setNewOpportunities(body.opportunities || []);
  }, [password]);

  useEffect(() => {
    loadApproved().catch((loadError) => setError(loadError.message));
  }, [loadApproved]);

  useEffect(() => {
    if (!job?.id || job.status !== 'running') return undefined;
    let alive = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/opportunities/jobs/${job.id}`, {
          cache: 'no-store',
          headers: { 'x-site-password': password },
        });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || 'Could not read agent progress.');
        if (!alive) return;
        setJob(next);
        if (next.status === 'completed') {
          await Promise.all([loadApproved(), loadNew()]);
          setNotice('Refresh complete. Any verified matches are ready for review below.');
        }
      } catch (pollError) {
        if (alive) setError(pollError.message);
      }
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [job?.id, job?.status, loadApproved, loadNew, password]);

  const unlock = async (event) => {
    event.preventDefault();
    setError(''); setNotice(''); setIsUnlocking(true);
    try {
      await loadNew();
      setNotice('New opportunities unlocked for this browser session.');
    } catch (unlockError) {
      setNewOpportunities([]);
      setError(unlockError.message);
    } finally {
      setIsUnlocking(false);
    }
  };

  const refresh = async () => {
    setError(''); setNotice(''); setIsStarting(true);
    try {
      const response = await fetch('/api/opportunities/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not start the agent.');
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
      const response = await fetch(`/api/opportunities/jobs/${job.id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not cancel the job.');
      setJob(body);
    } catch (cancelError) { setError(cancelError.message); }
  };

  const decide = async (opportunity, status) => {
    const before = newOpportunities;
    setError(''); setNotice(status === 'approved' ? 'Approved.' : 'Rejected.');
    setUpdatingId(opportunity.id);
    setNewOpportunities((items) => items.filter((item) => item.id !== opportunity.id));
    if (status === 'approved') setApproved((items) => [{ ...opportunity, status }, ...items]);
    try {
      const response = await fetch(`/api/opportunities/${opportunity.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, status }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not update opportunity.');
      if (status === 'approved') setApproved((items) => items.map((item) => item.id === body.opportunity.id ? body.opportunity : item));
    } catch (decisionError) {
      setNewOpportunities(before);
      if (status === 'approved') setApproved((items) => items.filter((item) => item.id !== opportunity.id));
      setNotice(''); setError(decisionError.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const phase = !job ? 'Ready to research' : job.status === 'running' && job.pageReads === 0 ? 'Searching for matches' : job.status === 'running' ? 'Reading official sources' : job.status === 'completed' ? 'Checking complete' : job.status;

  return <main className="opportunities-shell">
    <header className="game-header opportunity-header"><a className="brand" href="/"><i />George Lyu</a><nav className="game-nav" aria-label="Main menu"><a href="/">HOME</a><a className="active" href="/opportunities">OPPORTUNITIES</a></nav></header>
    <section className="opportunity-hero"><p className="kicker">PERSONAL RESEARCH DESK</p><h1>Find your next<br/><em>good idea.</em></h1><p>Approved opportunities are public. Enter the site password to review fresh matches and run a new search.</p></section>
    <section className="opportunity-grid">
      <aside className="research-panel"><p className="panel-label">OPPORTUNITY RADAR</p><h2>Manage opportunities</h2><p className="muted">Your password is sent only to this site’s server and remains in this browser tab.</p><form onSubmit={unlock}><label htmlFor="site-password">Site password</label><input id="site-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Enter password" autoComplete="current-password"/><button className="primary-action" disabled={isUnlocking}>{isUnlocking ? 'Unlocking…' : 'Unlock new opportunities'}</button></form><button className="refresh-action" type="button" onClick={refresh} disabled={!password || isStarting || job?.status === 'running'}>{isStarting ? 'Starting…' : 'Refresh opportunities'}</button>{error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="success-message" role="status">{notice}</p>}</aside>
      <section className="live-panel" aria-live="polite"><div className="live-heading"><div><p className="panel-label">LIVE ACTIVITY</p><h2>{phase}</h2></div>{job?.status === 'running' && <button className="cancel-action" type="button" onClick={cancel}>Cancel</button>}</div>{job ? <><div className="meter"><i style={{ width: `${Math.min(100, (job.searches + job.pageReads) * 7)}%` }} /></div><div className="progress-stats"><span><b>{job.searches}</b> searches</span><span><b>{job.pageReads}</b> sources read</span><span><b>{formatTime(job.elapsedMs)}</b> elapsed</span></div>{job.error && <p className="error-message" role="alert">Search failed: {job.error}</p>}<details className="tool-log"><summary>Show real agent activity ({job.toolCalls?.length || 0})</summary><ol>{job.toolCalls?.map((call, index) => <li key={`${call.at}-${index}`}><strong>{call.tool === 'web_search' ? 'Searching' : call.tool === 'open_page' ? 'Reading source' : call.tool === 'update_site' ? 'Saving opportunity' : 'Checking matches'}</strong>{call.url && <> — <SourceLink href={call.url} /></>}{call.status && <small>{call.status}</small>}</li>)}</ol></details></> : <p className="empty-state">Unlock management to run a refresh and see its live progress.</p>}</section>
    </section>
    <section className="results-wrap"><div className="results-intro"><p className="kicker">PUBLIC OPPORTUNITIES</p><h2>Approved <em>ideas.</em></h2></div><div className="opportunity-list">{approved.length ? approved.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />) : <p className="empty-state">No approved opportunities yet.</p>}</div></section>
    {newOpportunities.length > 0 && <section className="results-wrap" aria-live="polite"><div className="results-intro"><p className="kicker">PRIVATE REVIEW QUEUE</p><h2>New <em>opportunities.</em></h2></div><div className="opportunity-list">{newOpportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} controls isUpdating={updatingId === opportunity.id} onDecision={(status) => decide(opportunity, status)} />)}</div></section>}
  </main>;
}
