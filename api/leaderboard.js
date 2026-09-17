// POST: Record High Score
  if (req.method === 'POST') {
    const { name, streak, score, cps } = req.body || {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Valid player tag required.' });
    }

    // Strip special characters and trim
    const cleanName = name.replace(/[<>"'/\\`]/g, '').trim().slice(0, 14);

    // 1. Length check: Minimum 4 characters
    if (cleanName.length < 4) {
      return res.status(400).json({ error: 'Name must be at least 4 characters long.' });
    }

    // 2. Number check: Cannot be purely numbers
    if (/^\d+$/.test(cleanName)) {
      return res.status(400).json({ error: 'Name cannot be numbers only.' });
    }

    if (cps && Number(cps) > 40) {
      return res.status(403).json({ error: 'CPS limit exceeded.' });
    }

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
