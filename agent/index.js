import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { Agent, run, tool, webSearchTool } from '@openai/agents';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const PORT = Number(process.env.PORT || 8080);
const interestsPath = new URL('./interests.txt', import.meta.url);
const MAX_SEARCHES = 10;
const MAX_PAGE_READS = 15;
const MAX_RUNTIME_MS = 4 * 60 * 1000;
const MAX_PAGE_CHARS = 12_000;
const jobs = new Map();
const unknownProfileRequirement = /\b(student|school|year\s*\d|years?\s*\d|teacher|mentor|coordinator|parent|carer|membership|member|citizen|citizenship|resident|experience|transport|payment|fee|permission)\b/i;
const availabilityLanguage = /\b(open|registrations?\s+(?:open|close)|entries?\s+close|applications?\s+(?:open|close)|deadline|sign-?ups?\s+(?:open|available)|tickets?\s+(?:available|on sale))\b/i;
const reportSchema = z.object({
  profileConsidered: z.string(),
  verified: z.array(z.object({
    name: z.string(),
    whyItFits: z.string(),
    eligibilityEvidence: z.object({ excerpt: z.string(), url: z.string() }),
    availabilityEvidence: z.object({ excerpt: z.string(), url: z.string() }),
    location: z.string(),
  })),
  inconclusive: z.array(z.object({ name: z.string(), reason: z.string(), sourcesChecked: z.array(z.string()) })),
  rejected: z.array(z.object({ name: z.string(), reason: z.string(), sourcesChecked: z.array(z.string()) })),
});

function elapsedMs(job) {
  return Date.now() - job.startedAt;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    searches: job.searches,
    pageReads: job.pageReads,
    elapsedMs: elapsedMs(job),
    toolCalls: job.toolCalls,
    ...(job.status === 'completed' ? { results: job.results } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
}

function logTool(job, entry) {
  const record = { at: new Date().toISOString(), ...entry };
  job.toolCalls.push(record);
  console.log(`[job ${job.id}] ${JSON.stringify(record)}`);
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set to save opportunities.');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function update_site(job, item) {
  const url = item.availabilityEvidence.url;
  const client = supabase();
  const { data: existing, error: lookupError } = await client
    .from('opportunities')
    .select('id')
    .eq('url', url)
    .maybeSingle();

  if (lookupError) throw new Error(`Could not check ${url}: ${lookupError.message}`);
  if (existing) {
    logTool(job, { tool: 'update_site', status: 'skipped', url, reason: 'URL already exists', id: existing.id });
    return { saved: false, id: existing.id };
  }

  const sourceExcerpt = `Eligibility: ${item.eligibilityEvidence.excerpt}\n\nAvailability: ${item.availabilityEvidence.excerpt}`;
  const { data, error } = await client
    .from('opportunities')
    .insert({
      title: item.name,
      url,
      source_excerpt: sourceExcerpt,
      why_it_fits: item.whyItFits,
      status: 'new',
    })
    .select('id')
    .single();

  if (error?.code === '23505') {
    logTool(job, { tool: 'update_site', status: 'skipped', url, reason: 'URL already exists' });
    return { saved: false };
  }
  if (error) throw new Error(`Could not save ${url}: ${error.message}`);

  logTool(job, { tool: 'update_site', status: 'saved', url, id: data.id });
  return { saved: true, id: data.id };
}

function isPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && host !== 'localhost' && !host.endsWith('.local') && !isIP(host);
  } catch {
    return false;
  }
}

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PAGE_CHARS);
}

function createOpenPageTool(job) {
  return tool({
    name: 'open_page',
    description: 'Read exactly one official public HTTPS page after web search. Use it to verify a specific opportunity. The result contains readable text, not an interpretation.',
    parameters: z.object({ url: z.string().describe('One official HTTPS page URL to read.') }),
    execute: async ({ url }) => {
      const call = job.pageReads + 1;
      logTool(job, { tool: 'open_page', call, url, status: 'called' });
      if (job.pageReads >= MAX_PAGE_READS) {
        logTool(job, { tool: 'open_page', call, url, status: 'blocked', error: `Page-read limit reached (${MAX_PAGE_READS}).` });
        throw new Error(`Page-read limit reached (${MAX_PAGE_READS}). Finish with the evidence already collected.`);
      }
      if (!isPublicHttpsUrl(url)) {
        logTool(job, { tool: 'open_page', call, url, status: 'blocked', error: 'Only public HTTPS pages may be opened.' });
        return 'Refused: only public HTTPS pages may be opened.';
      }

      job.pageReads += 1;
      try {
        let currentUrl = url;
        let response;
        for (let redirects = 0; redirects <= 3; redirects += 1) {
          if (!isPublicHttpsUrl(currentUrl)) return 'Refused: redirect left public HTTPS.';
          response = await fetch(currentUrl, {
            redirect: 'manual',
            signal: job.controller.signal,
            headers: { 'User-Agent': 'OpportunityAgent/1.0' },
          });
          if (response.status < 300 || response.status >= 400) break;
          const location = response.headers.get('location');
          if (!location) return `Could not read page: HTTP ${response.status} without a redirect location.`;
          currentUrl = new URL(location, currentUrl).toString();
        }
        if (!response) return 'Could not read page.';
        if (response.status >= 300 && response.status < 400) return 'Could not read page: too many redirects.';
        if (!response.ok) return `Could not read page: HTTP ${response.status}.`;
        const type = response.headers.get('content-type') || '';
        if (!type.includes('text/html') && !type.includes('text/plain')) {
          return `Could not read page: unsupported content type ${type || 'unknown'}.`;
        }
        const text = pageText(await response.text());
        logTool(job, { tool: 'open_page', call: job.pageReads, url: currentUrl, status: 'completed' });
        return text ? `Official page: ${currentUrl}\n\n${text}` : 'Could not read usable text from this page.';
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        logTool(job, { tool: 'open_page', call: job.pageReads, url, status: 'failed', error: message });
        return `Could not read page: ${message}.`;
      }
    },
  });
}

function instructions(today) {
  return `You are a cautious opportunity researcher. Today is ${today}. Treat the profile supplied in the user message as the sole source of personal facts, including age; do not replace it with assumptions.

Research up to five current competitions, programs, or events. Search before opening pages. You have at most ${MAX_SEARCHES} web searches and ${MAX_PAGE_READS} page reads; stop using a tool at its limit. Use open_page on an official organiser, venue, government, competition, or program page for every item you investigate.

An item can appear under Verified opportunities only if you have actually read an official page and can quote a short excerpt from that page for BOTH:
- eligibility: an age range including 15; and
- availability: explicit confirmation that registrations, applications, entries, tickets, or sign-ups are open now, or a deadline on/after today.

The official source must also show Sydney/NSW access or clear online access to Australians. Do not treat a general event listing, a future date, “bookings essential”, or “check availability” as evidence that an item is open. Do not assume school enrolment, year level, experience, membership, citizenship, payment, transport, a mentor, or parental permission. If a source says student, school, years/year level, teacher, school coordinator, mentor, nomination, membership, citizenship, payment, transport, or permission, it can NEVER be Verified from this profile; put it under Inconclusive with that missing profile fact. If any other evidence is missing, use the remaining search/page-read budget to investigate another official source before accepting OR rejecting the item. If evidence remains unavailable, put it under Inconclusive—not Verified or Rejected.

Never invent results, dates, eligibility, availability, excerpts, or URLs. Return fewer than five verified items if that is all the evidence supports.

Return the required structured result. For every verified item, include short exact source excerpts and the official URLs for eligibility and availability. For every inconclusive or rejected item, include the official URLs checked.`;
}

function createAgent(job) {
  return new Agent({
    name: 'Sydney Opportunity Finder',
    instructions: instructions(new Date().toISOString().slice(0, 10)),
    tools: [webSearchTool({ searchContextSize: 'low' }), createOpenPageTool(job)],
    outputType: reportSchema,
  });
}

function auditReport(report) {
  const verified = [];
  const inconclusive = [...report.inconclusive];
  for (const item of report.verified) {
    const evidence = `${item.eligibilityEvidence.excerpt} ${item.availabilityEvidence.excerpt}`;
    const sources = [item.eligibilityEvidence.url, item.availabilityEvidence.url];
    if (!isPublicHttpsUrl(item.eligibilityEvidence.url) || !isPublicHttpsUrl(item.availabilityEvidence.url)) {
      inconclusive.push({ name: item.name, reason: 'The result used an invalid official-source URL.', sourcesChecked: sources });
    } else if (unknownProfileRequirement.test(evidence)) {
      inconclusive.push({ name: item.name, reason: 'Eligibility depends on a fact not present in the profile.', sourcesChecked: sources });
    } else if (!availabilityLanguage.test(item.availabilityEvidence.excerpt)) {
      inconclusive.push({ name: item.name, reason: 'The quoted source does not explicitly establish current availability.', sourcesChecked: sources });
    } else {
      verified.push(item);
    }
  }
  return { profileConsidered: report.profileConsidered, verified, inconclusive, rejected: report.rejected };
}

function toolDetails(item) {
  const raw = item?.rawItem ?? item;
  return {
    id: raw?.id,
    name: raw?.name,
    arguments: raw?.arguments,
    status: raw?.status,
  };
}

async function runJob(job) {
  const timeout = setTimeout(() => job.controller.abort(new Error('Four-minute time limit reached.')), MAX_RUNTIME_MS);
  try {
    const interests = await readFile(interestsPath, 'utf8');
    const streamed = await run(createAgent(job), `Research opportunities for this profile:\n\n${interests}`, {
      stream: true,
      signal: job.controller.signal,
      maxTurns: 28,
    });
    const seenSearches = new Set();
    for await (const event of streamed) {
      if (event.type === 'raw_model_stream_event') {
        const raw = event.data?.event;
        const rawItem = raw?.item;
        if (raw?.type === 'response.output_item.added' && rawItem?.type === 'web_search_call') {
          const callKey = rawItem.id || `${rawItem.action?.query || 'web_search'}:${job.searches}`;
          if (!seenSearches.has(callKey)) {
            seenSearches.add(callKey);
            if (job.searches >= MAX_SEARCHES) {
              job.controller.abort(new Error(`Search limit reached (${MAX_SEARCHES}).`));
              break;
            }
            job.searches += 1;
            logTool(job, {
              tool: 'web_search',
              call: job.searches,
              status: rawItem.status || 'called',
              query: rawItem.action?.query || null,
            });
          }
        }
        continue;
      }
      if (event.type !== 'run_item_stream_event' || event.name !== 'tool_called') continue;
      const details = toolDetails(event.item);
      if (details.name !== 'web_search' && details.name !== 'web_search_preview') continue;
      const callKey = details.id || `${details.name}:${details.arguments || job.searches}`;
      if (seenSearches.has(callKey)) continue;
      seenSearches.add(callKey);
      if (job.searches >= MAX_SEARCHES) {
        job.controller.abort(new Error(`Search limit reached (${MAX_SEARCHES}).`));
        break;
      }
      job.searches += 1;
      logTool(job, { tool: 'web_search', call: job.searches, status: details.status || 'called', arguments: details.arguments || null });
    }
    await streamed.completed;
    if (job.controller.signal.aborted) throw job.controller.signal.reason || new Error('Job cancelled.');
    if (!streamed.finalOutput) throw new Error('No report was returned.');
    logTool(job, { tool: 'checking_matches', status: 'started' });
    job.results = auditReport(streamed.finalOutput);
    logTool(job, { tool: 'checking_matches', status: 'completed' });
    for (const item of job.results.verified) {
      await update_site(job, item);
    }
    job.status = 'completed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.status = job.cancelled ? 'cancelled' : 'error';
    job.error = job.cancelled ? 'Job cancelled.' : message;
  } finally {
    clearTimeout(timeout);
  }
}

function isAuthorized(request) {
  const supplied = request.headers.agent_secret;
  const expected = process.env.AGENT_SECRET;
  if (typeof supplied !== 'string' || !expected) return false;
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const match = url.pathname.match(/^\/jobs\/([\w-]+)(?:\/(cancel))?$/);

  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('agent is running');
    return;
  }

  if (request.method === 'POST' && url.pathname === '/jobs') {
    if (!isAuthorized(request)) return sendJson(response, 401, { error: 'Unauthorized' });
    const job = {
      id: randomUUID(),
      status: 'running',
      searches: 0,
      pageReads: 0,
      toolCalls: [],
      startedAt: Date.now(),
      controller: new AbortController(),
      cancelled: false,
      results: null,
      error: null,
    };
    jobs.set(job.id, job);
    void runJob(job);
    return sendJson(response, 202, { id: job.id });
  }

  if (match) {
    const [, id, action] = match;
    const job = jobs.get(id);
    if (!job) return sendJson(response, 404, { error: 'Job not found' });
    if (request.method === 'GET' && !action) return sendJson(response, 200, publicJob(job));
    if (request.method === 'POST' && action === 'cancel') {
      if (!isAuthorized(request)) return sendJson(response, 401, { error: 'Unauthorized' });
      if (job.status === 'running') {
        job.cancelled = true;
        job.controller.abort(new Error('Cancelled by request.'));
      }
      return sendJson(response, 202, publicJob(job));
    }
  }

  sendJson(response, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Opportunity agent listening on port ${PORT}`);
});
