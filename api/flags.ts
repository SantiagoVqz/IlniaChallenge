import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Read
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Get identity from JWT
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    console.error('flags: missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
    res.status(500).json({ error: 'Server misconfigured' });
    return;
  }
  
  // Request scoped client
  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('min_tier', { ascending: true });

  if (error) {
    // Invalid/expired JWT surfaces here as an auth error -> 401; otherwise 500.
    const status =
      error.code === 'PGRST301' || error.message.toLowerCase().includes('jwt') ? 401 : 500;
    if (status === 500) console.error('flags: query error', error);
    res.status(status).json({ error: status === 401 ? 'Invalid token' : 'Query failed' });
    return;
  }

  res.status(200).json({ flags: data ?? [] });
}
