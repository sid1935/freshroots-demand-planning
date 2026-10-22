// Vercel function: shared storage for planner decisions, backed by Supabase.
// The service-role key stays on the server. If PLANNER_PASSCODE is set, writes
// (and reads) require it in the x-passcode header, since the site itself is public.
import { timingSafeEqual } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.PLANNER_PASSCODE;

const sb = (path, init = {}) =>
  fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, 'content-type': 'application/json', ...init.headers } });

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isSku = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s);

export default async function handler(req, res) {
  if (!URL_ || !KEY) return res.status(503).json({ error: 'Storage is not configured' });
  if (PASS && !same(String(req.headers['x-passcode'] || ''), PASS)) return res.status(401).json({ error: 'Passcode required' });

  try {
    if (req.method === 'GET') {
      const { as_of } = req.query;
      if (!isDate(as_of)) return res.status(400).json({ error: 'as_of must be YYYY-MM-DD' });
      const r = await sb(`planner_decisions?as_of=eq.${as_of}&select=sku_id,status,qty,reason,decided_at`);
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      return res.status(200).json(await r.json());
    }

    if (req.method === 'POST') {
      const { as_of, sku_id, status, qty, reason } = req.body || {};
      if (!isDate(as_of) || !isSku(sku_id) || !['accepted', 'overridden'].includes(status)) return res.status(400).json({ error: 'Invalid decision' });
      if (status === 'overridden' && !(Number.isInteger(qty) && qty >= 0)) return res.status(400).json({ error: 'Override needs an integer qty' });
      const row = { as_of, sku_id, status, qty: status === 'overridden' ? qty : null, reason: reason ? String(reason).slice(0, 200) : null, decided_at: new Date().toISOString() };
      const r = await sb('planner_decisions?on_conflict=as_of,sku_id', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { as_of, sku_id } = req.query;
      if (!isDate(as_of) || !isSku(sku_id)) return res.status(400).json({ error: 'Invalid request' });
      const r = await sb(`planner_decisions?as_of=eq.${as_of}&sku_id=eq.${encodeURIComponent(sku_id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`Supabase ${r.status}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Storage request failed' });
  }
}
