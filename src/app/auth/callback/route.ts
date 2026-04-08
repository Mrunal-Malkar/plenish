import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    // Ensure public.users row exists for this user.
    // The trigger handles new sign-ups, but this covers users who authenticated
    // before the trigger was in place (existing sessions, re-logins, etc.).
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .upsert(
          { id: user.id, email: user.email ?? '', default_language: 'es' },
          { onConflict: 'id', ignoreDuplicates: true }
        );
    }
  }

  // Redirect to the dashboard after successful login
  return NextResponse.redirect(`${origin}/dashboard`);
}
