import { NextResponse } from 'next/server';
import { hasSitePassword } from '../../../../lib/site-password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function agentConfig() {
  const { AGENT_URL, AGENT_SECRET } = process.env;
  if (!AGENT_URL || !AGENT_SECRET) throw new Error('The opportunity agent is not configured.');
  return { baseUrl: AGENT_URL.replace(/\/$/, ''), secret: AGENT_SECRET };
}

export async function POST(request) {
  try {
    const { password } = await request.json().catch(() => ({}));
    if (!hasSitePassword(password)) {
      return NextResponse.json({ error: 'Incorrect site password.' }, { status: 401 });
    }
    const { baseUrl, secret } = agentConfig();
    const response = await fetch(`${baseUrl}/jobs`, {
      method: 'POST',
      headers: { AGENT_SECRET: secret },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: body.error || 'The agent could not start a job.' }, { status: 502 });
    return NextResponse.json({ id: body.id }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The agent is unavailable.' }, { status: 502 });
  }
}
