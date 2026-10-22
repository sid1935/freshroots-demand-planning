// Saves this run's recommendations to Supabase (recommendation_runs), one row per as-of date.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env. Run after `npm run run`.
import fs from 'node:fs';

try { process.loadEnvFile('.env'); } catch { /* variables may already be set */ }
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const rec = JSON.parse(fs.readFileSync('output/recommendations.json', 'utf8'));
const res = await fetch(`${url}/rest/v1/recommendation_runs?on_conflict=as_of`, {
  method: 'POST',
  headers: { apikey: key, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ as_of: rec.as_of, payload: rec }),
});
if (!res.ok) {
  console.error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`Saved run for ${rec.as_of} (${rec.recommendations.length} SKUs) to Supabase`);
