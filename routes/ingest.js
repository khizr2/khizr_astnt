// routes/ingest.js
const express = require('express');
const router = express.Router();
const { supabase } = require('../database/connection'); // Supabase client

// allowed categories
const CATS = new Set(['task','idea','topic','health','life','home','spirituality']);

// tiny parser: line-by-line; supports prefixes and #category tags
function parseLines(raw) {
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    // prefix: starts with 'zz ' | '? ' | 'og '
    let prefix = null;
    if (line.startsWith('zz ')) prefix = 'zz';
    else if (line.startsWith('? ')) prefix = '?';
    else if (line.startsWith('og ')) prefix = 'og';

    const body = prefix ? line.slice(prefix.length + 1).trim() : line;

    // category via hashtag (e.g., #health #viztron)
    let category = null;
    const tags = [];
    for (const m of body.matchAll(/#([a-zA-Z0-9_-]+)/g)) {
      const tag = m[1].toLowerCase();
      if (CATS.has(tag)) category = tag;
      tags.push(tag);
    }

    // title = first 80 chars before tags
    const title = body.replace(/#[a-zA-Z0-9_-]+/g, '').trim().slice(0, 80) || null;

    out.push({ prefix: prefix || 'og', category, title, body, tags });
  }
  return out;
}

router.post('/', async (req, res) => {
  try {
    // if you have auth, use req.user.id; fallback for quick test:
    const userId = req.user?.id || req.body.user_id; // allow user_id during MVP

    if (!userId) return res.status(400).json({ error: 'user_id required for MVP' });
    if (!req.body?.text) return res.status(400).json({ error: 'text is required' });

    const items = parseLines(req.body.text);
    const inserted = [];

    for (const it of items) {
      const { data, error } = await supabase
        .from('notes')
        .insert({
          user_id: userId,
          prefix: it.prefix,
          category: it.category,
          title: it.title,
          body: it.body,
          tags: it.tags
        })
        .select()
        .single();

      if (error) throw error;
      inserted.push(data);

      // auto-create a task for 'zz'
      if (it.prefix === 'zz') {
        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            user_id: userId,
            source_note_id: data.id,
            priority: 0
          });

        if (taskError) throw taskError;
      }
    }

    res.json({ count: inserted.length, items: inserted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'ingest_failed' });
  }
});

module.exports = router;
