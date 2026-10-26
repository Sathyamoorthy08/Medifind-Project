const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'local-demo-test-secret-that-is-long-enough-0123456789';
const app = require('../src/app');
const { createDemoStore } = require('../src/demoStore');
const { buildSuggestions } = require('../src/availabilityAssistant');
async function withDemo(run) {
  app.locals.demoStore = await createDemoStore(); app.locals.demoFallback = true;
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, app.locals.demoStore); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
async function assistant(base, q, pharmacyId) {
  const response = await fetch(`${base}/api/medicines/availability-assistant?q=${encodeURIComponent(q)}&pharmacyId=${encodeURIComponent(pharmacyId || '')}`);
  assert.equal(response.status, 200); return response.json();
}
test('assistant finds same medicine at another pharmacy and returns demo stock and price', () => withDemo(async (base, store) => {
  const target = store.pharmacies[0]; const report = await assistant(base, 'Paracetamol 500 mg', target._id);
  assert.equal(report.mode, 'other_pharmacies'); assert.ok(report.matches.length);
  assert.ok(report.matches.every(row => row.pharmacy.id !== target._id && row.quantity > 0 && row.price > 0 && row.isDemo));
  assert.match(report.matches[0].availability, /fictional demo inventory/i);
}));
test('assistant supports verified same-active-ingredient match with actual inventory details', () => withDemo(async (base, store) => {
  const report = buildSuggestions('Tylenol', store.inventory, store.pharmacies);
  assert.ok(report.suggestions.length);
  const row = report.suggestions.find(x => x.activeIngredient === 'paracetamol'); assert.ok(row);
  assert.match(row.matchReason, /same active ingredient/i); assert.ok(row.strength && row.form && row.pharmacy.name && row.price > 0 && row.quantity > 0);
}));
test('assistant reports no stock anywhere for a known medicine with zero inventory', () => withDemo(async (base, store) => {
  for (const item of store.inventory.filter(x => /ibuprofen/i.test(x.medicine))) item.quantity = 0;
  const report = await assistant(base, 'ibuprofen', store.pharmacies[0]._id);
  assert.equal(report.status, 'unavailable_everywhere'); assert.equal(report.suggestions.length, 0);
  assert.match(report.message, /no available stock at any listed pharmacy/i);
}));
test('unknown medicine yields no fabricated supported alternative', () => withDemo(async (base, store) => {
  const report = await assistant(base, 'Zorvexol-999', store.pharmacies[0]._id);
  assert.equal(report.status, 'no_verified_match'); assert.equal(report.suggestions.length, 0);
  assert.match(report.message, /No verified alternative found in the demo dataset/); assert.match(report.message, /licensed pharmacist or prescriber/i);
}));
test('assistant works with MongoDB unavailable using demo-memory API', () => withDemo(async (base, store) => {
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.database, 'demo-memory');
  const report = await assistant(base, 'Tylenol', store.pharmacies[0]._id); assert.equal(report.mode, 'other_pharmacies'); assert.ok(report.matches.every(x => x.pharmacy.id !== store.pharmacies[0]._id));
}));
test('React UI includes assistant trigger, loading/error states, and search action', async () => {
  const fs = require('node:fs'); const source = fs.readFileSync(require.resolve('../../src/main.jsx'), 'utf8');
  assert.match(source, /AvailabilityAssistant data=\{assistant\}/); assert.match(source, /assistantLoading/);
  assert.match(source, /Availability assistant could not load/); assert.match(source, /Search this medicine/);
  assert.match(source, /searchFor\(item\.medicine, item\.pharmacy\.city, ''\)/);
});
