import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: Return Top 10 Players
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('name, streak, score')
      .order('streak', { ascending: false })
      .order('score', { ascending: false })
      .limit(10);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ players: data || [] });
  }

  // POST: Record New Highscore
  if (req.method === 'POST') {
    const { name, streak, score, cps } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid player name required.' });
    }

    // Replace the cleanName line in api/leaderboard.js:
const cleanName = name
  .replace(/[<>"'/\\`]/g, '') // Strip script tags and breaking quotes
  .trim()
  .slice(0, 14);

if (!cleanName) {
  return res.status(400).json({ error: 'Valid alphanumeric player tag required.' });
    }
    
    // Anti-cheat: Block automated scripts (> 35 CPS)
    if (cps && Number(cps) > 35) {
      return res.status(403).json({ error: 'Click rate anomaly detected.' });
    }

    const cleanName = name.trim().slice(0, 14);
    const parsedStreak = Math.max(0, parseInt(streak, 10) || 0);
    const parsedScore = Math.max(0, parseInt(score, 10) || 0);

    const { data: existing } = await supabase
      .from('leaderboard')
      .select('streak, score')
      .eq('name', cleanName)
      .maybeSingle();

    if (existing) {
      const updatedStreak = Math.max(existing.streak, parsedStreak);
      const updatedScore = Math.max(existing.score, parsedScore);

      await supabase
        .from('leaderboard')
        .update({ streak: updatedStreak, score: updatedScore, updated_at: new Date() })
        .eq('name', cleanName);
    } else {
      await supabase
        .from('leaderboard')
        .insert([{ name: cleanName, streak: parsedStreak, score: parsedScore }]);
    }

    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
