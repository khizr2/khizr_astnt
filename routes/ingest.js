// routes/ingest.js
const express = require('express');
const router = express.Router();
const pool = require('../database/pool'); // your existing pg pool

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
      const { rows } = await pool.query(
        `INSERT INTO notes (user_id, prefix, category, title, body, tags)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [userId, it.prefix, it.category, it.title, it.body, it.tags]
      );
      inserted.push(rows[0]);

      // auto-create a task for 'zz'
      if (it.prefix === 'zz') {
        await pool.query(
          `INSERT INTO tasks (user_id, source_note_id, priority)
           VALUES ($1,$2,$3)`,
          [userId, rows[0].id, 0]
        );
      }
    }

    res.json({ count: inserted.length, items: inserted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'ingest_failed' });
  }
});

module.exports = router;
