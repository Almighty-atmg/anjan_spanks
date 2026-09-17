import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 1. Diagnose Missing Environment Variables
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: `Missing Vercel Env Vars: URL=${Boolean(supabaseUrl)}, KEY=${Boolean(supabaseKey)}. Did you redeploy?`
    });
  }

  let supabase;
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (initErr) {
    return res.status(500).json({ error: `Supabase Init Failed: ${initErr.message}` });
  }

  // GET: Fetch Top 10
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('leaderboard')
      .select('name, streak, score')
      .order('streak', { ascending: false })
      .order('score', { ascending: false })
      .limit(10);

    if (error) return res.status(500).json({ error: `DB Read Error: ${error.message}` });
    return res.status(200).json({ players: data || [] });
  }

  // POST: Record High Score
  if (req.method === 'POST') {
    const { name, streak, score, cps } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid player tag required.' });
    }

    if (cps && Number(cps) > 40) {
      return res.status(403).json({ error: 'CPS limit exceeded.' });
    }

    const cleanName = name.replace(/[<>"'/\\`]/g, '').trim().slice(0, 14);
    const parsedStreak = Math.max(0, parseInt(streak, 10) || 0);
    const parsedScore = Math.max(0, parseInt(score, 10) || 0);

    try {
      const { data: existing, error: selectErr } = await supabase
        .from('leaderboard')
        .select('streak, score')
        .eq('name', cleanName)
        .maybeSingle();

      if (selectErr) {
        return res.status(500).json({ error: `DB Select Error: ${selectErr.message}` });
      }

      if (existing) {
        const updatedStreak = Math.max(existing.streak, parsedStreak);
        const updatedScore = Math.max(existing.score, parsedScore);

        const { error: updateErr } = await supabase
          .from('leaderboard')
          .update({ streak: updatedStreak, score: updatedScore, updated_at: new Date() })
          .eq('name', cleanName);

        if (updateErr) {
          return res.status(500).json({ error: `DB Update Error: ${updateErr.message}` });
        }
      } else {
        const { error: insertErr } = await supabase
          .from('leaderboard')
          .insert([{ name: cleanName, streak: parsedStreak, score: parsedScore }]);

        if (insertErr) {
          return res.status(500).json({ error: `DB Insert Error: ${insertErr.message}` });
        }
      }

      return res.status(200).json({ success: true });
    } catch (dbErr) {
      return res.status(500).json({ error: `Server Exception: ${dbErr.message}` });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
