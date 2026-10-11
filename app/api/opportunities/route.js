import { NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fields = 'id,title,url,source_excerpt,why_it_fits,status,found_at,decided_at';

export async function GET() {
  try {
    const { data, error } = await createAdminClient()
      .from('opportunities')
      .select(fields)
      .eq('status', 'approved')
      .order('found_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ opportunities: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load opportunities.' }, { status: 500 });
  }
}
