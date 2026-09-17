import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing Database Environment Variables.' });
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
    const { name, streak, score, cps, token } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid player tag required.' });
    }

    // 1. Anti-Tamper Token Validation (Blocks console fetch injection)
    // The expected format is Base64 of: name_score_spank_streak
    const expectedString = `${name}_${score}_spank_${streak}`;
    const expectedToken = Buffer.from(encodeURIComponent(expectedString)).toString('base64');
    
    if (!token || token !== expectedToken) {
      return res.status(403).json({ error: 'Anti-cheat: Invalid security token.' });
    }

    const cleanName = name.replace(/[<>"'/\\`]/g, '').trim().slice(0, 14);

    if (cleanName.length < 4) {
      return res.status(400).json({ error: 'Name must be at least 4 characters.' });
    }

    if (/^\d+$/.test(cleanName)) {
      return res.status(400).json({ error: 'Name cannot be numbers only.' });
    }

    const parsedStreak = Math.max(0, parseInt(streak, 10) || 0);
    const parsedScore = Math.max(0, parseInt(score, 10) || 0);

    try {
      const { data: existing, error: selectErr } = await supabase
        .from('leaderboard')
        .select('streak, score, updated_at')
        .eq('name', cleanName)
        .maybeSingle();

      if (selectErr) return res.status(500).json({ error: `DB Select Error: ${selectErr.message}` });

      if (existing) {
        // 2. Strict Mathematical Time Validation
        const timeDiffMs = new Date().getTime() - new Date(existing.updated_at).getTime();
        const timeDiffSecs = timeDiffMs / 1000;
        const streakGained = parsedStreak - existing.streak;

        // If they gained points, check if it's humanly possible in the time elapsed
        if (streakGained > 0 && timeDiffSecs > 0) {
          const mathematicalCps = streakGained / timeDiffSecs;
          // If the math proves they clicked faster than 25 times a second, it's a console hack
          if (mathematicalCps > 25) {
            return res.status(403).json({ error: `Anti-cheat: Impossible score jump detected.` });
          }
        }

        const updatedStreak = Math.max(existing.streak, parsedStreak);
        const updatedScore = Math.max(existing.score, parsedScore);

        const { error: updateErr } = await supabase
          .from('leaderboard')
          .update({ streak: updatedStreak, score: updatedScore, updated_at: new Date() })
          .eq('name', cleanName);

        if (updateErr) return res.status(500).json({ error: `DB Update Error: ${updateErr.message}` });
      } else {
        // 3. Prevent massive starting scores for brand new players
        if (parsedStreak > 500) {
           return res.status(403).json({ error: `Anti-cheat: Starting score too high.` });
        }

        const { error: insertErr } = await supabase
          .from('leaderboard')
          .insert([{ name: cleanName, streak: parsedStreak, score: parsedScore }]);

        if (insertErr) return res.status(500).json({ error: `DB Insert Error: ${insertErr.message}` });
      }

      return res.status(200).json({ success: true });
    } catch (dbErr) {
      return res.status(500).json({ error: `Server Exception: ${dbErr.message}` });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
