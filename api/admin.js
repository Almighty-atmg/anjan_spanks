import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEV_PASSKEY = process.env.DEV_PASSKEY;

function generateSessionToken() {
  if (!DEV_PASSKEY) return null;
  return crypto.createHmac('sha256', DEV_PASSKEY).update('spank-dev-auth').digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, password, name, streak, score } = req.body || {};

  // 1. Password Verification
  if (action === 'login') {
    if (password === DEV_PASSKEY) {
      return res.status(200).json({ success: true, token: generateSessionToken() });
    }
    return res.status(401).json({ error: 'Invalid passkey.' });
  }

  // 2. Token Verification for Mutations
  const clientToken = req.headers['x-admin-token'];
  if (!clientToken || clientToken !== generateSessionToken()) {
    return res.status(403).json({ error: 'Unauthorized developer session.' });
  }

  // Edit Player
  if (action === 'edit') {
    const { error } = await supabase
      .from('leaderboard')
      .update({
        streak: Math.max(0, parseInt(streak, 10) || 0),
        score: Math.max(0, parseInt(score, 10) || 0),
        updated_at: new Date()
      })
      .eq('name', name);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // Delete Player
  if (action === 'delete') {
    const { error } = await supabase
      .from('leaderboard')
      .delete()
      .eq('name', name);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  // Wipe All Records
  if (action === 'wipe') {
    const { error } = await supabase
      .from('leaderboard')
      .delete()
      .neq('name', '');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(400).json({ error: 'Unknown admin action.' });
}
