import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const baseUrl = process.env.AGENT_URL?.replace(/\/$/, '');
    if (!baseUrl) throw new Error('The opportunity agent is not configured.');
    const response = await fetch(`${baseUrl}/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The agent is unavailable.' }, { status: 502 });
  }
}
