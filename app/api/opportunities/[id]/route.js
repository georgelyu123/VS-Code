import { NextResponse } from 'next/server';
import { hasSitePassword } from '../../../../lib/site-password';
import { createAdminClient } from '../../../../lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fields = 'id,title,url,source_excerpt,why_it_fits,status,found_at,decided_at';

export async function PATCH(request, { params }) {
  try {
    const { password, status } = await request.json().catch(() => ({}));
    if (!hasSitePassword(password)) {
      return NextResponse.json({ error: 'Incorrect site password.' }, { status: 401 });
    }
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Status must be approved or rejected.' }, { status: 400 });
    }
    const { id } = await params;
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: 'Invalid opportunity id.' }, { status: 400 });
    const { data, error } = await createAdminClient()
      .from('opportunities')
      .update({ status, decided_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'new')
      .select(fields)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'New opportunity not found.' }, { status: 404 });
    return NextResponse.json({ opportunity: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update opportunity.' }, { status: 500 });
  }
}
