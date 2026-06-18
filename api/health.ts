import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'ok',
    env: process.env.APP_ENV ?? 'unknown',
    supabaseUrl: process.env.SUPABASE_URL ?? null,
  });
}