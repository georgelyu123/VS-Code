import { NextResponse } from 'next/server';
import { passwordFromRequest, hasSitePassword } from '../../../../lib/site-password';
import { createAdminClient } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fields = 'id,title,url,source_excerpt,why_it_fits,status,found_at,decided_at';

export async function GET(request) {
  if (!hasSitePassword(passwordFromRequest(request))) {
    return NextResponse.json({ error: 'Incorrect site password.' }, { status: 401 });
  }
  try {
    const { data, error } = await createAdminClient()
      .from('opportunities')
      .select(fields)
      .eq('status', 'new')
      .order('found_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ opportunities: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load new opportunities.' }, { status: 500 });
  }
}
