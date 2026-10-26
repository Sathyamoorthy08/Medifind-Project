const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.JWT_SECRET = 'local-demo-test-secret-that-is-long-enough-0123456789';
const app = require('../src/app');
const { createDemoStore } = require('../src/demoStore');
async function withApi(run) {
  app.locals.demoStore = await createDemoStore(); app.locals.demoFallback = true;
  const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('demo catalog has 21 fictional medicines and category search finds them', async () => withApi(async base => {
  const search = async q => (await fetch(`${base}/api/medicines/search?q=${encodeURIComponent(q)}`)).json();
  const all = await search('Pain and fever relief'); assert.ok(all.results.length >= 15);
  assert.ok(all.results.every(x => x.stockLabel === 'Fictional demo inventory'));
  const ors = await search('oral rehydration'); assert.ok(ors.results.length >= 5);
  const assistant = await (await fetch(`${base}/api/medicines/availability-assistant?q=tylenol`)).json();
  assert.equal(assistant.mode, 'other_pharmacies'); assert.ok(assistant.matches.length > 0); assert.match(assistant.matches[0].matchReason, /generic or active ingredient/i);
  const unknown = await (await fetch(`${base}/api/medicines/availability-assistant?q=madeupmedicinexyz`)).json();
  assert.equal(unknown.recognized, false); assert.deepEqual(unknown.suggestions, []); assert.match(unknown.message, /No verified alternative found in the demo dataset/);
  const partialUnknown = await (await fetch(`${base}/api/medicines/availability-assistant?q=med`)).json(); assert.equal(partialUnknown.recognized, false); assert.deepEqual(partialUnknown.suggestions, []);
}));
test('reservation lifecycle reserves exact quantity, accepts without second deduction, rejects/cancels once, and enforces ownership', async () => withApi(async base => {
  const call = async (endpoint, { method = 'GET', token, body } = {}) => { const response = await fetch(`${base}/api${endpoint}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { response, data: await response.json() }; };
  const user = (await call('/auth/login', { method: 'POST', body: { email: 'user@demo.medifind.test', password: 'DemoPass123!' } })).data;
  const pharmacy = (await call('/auth/login', { method: 'POST', body: { email: 'pharmacy@demo.medifind.test', password: 'DemoPass123!' } })).data;
  const second = (await call('/auth/register', { method: 'POST', body: { name: 'Second User', email: 'second@example.test', password: 'AnotherPass123!', role: 'user' } })).data;
  const search = async () => (await call('/medicines/search?q=Paracetamol')).data.results;
  const first = (await search()).find(x => x.pharmacy.name === 'GreenCross Pharmacy'); const original = first.quantity;
  const reserve = quantity => call('/reservations', { method: 'POST', token: user.token, body: { inventoryId: first.id, quantity } });
  let result = await reserve(3); assert.equal(result.response.status, 201); assert.equal(result.data.reservation.status, 'pending'); assert.equal(result.data.reservation.totalPrice, first.price * 3);
  let current = (await search()).find(x => x.id === first.id); assert.equal(current.quantity, original - 3);
  let changed = await call(`/reservations/${result.data.reservation._id}/status`, { method: 'PATCH', token: pharmacy.token, body: { status: 'confirmed' } }); assert.equal(changed.response.status, 200);
  current = (await search()).find(x => x.id === first.id); assert.equal(current.quantity, original - 3, 'acceptance must not deduct again');
  let stranger = await call(`/reservations/${result.data.reservation._id}/cancel`, { method: 'PATCH', token: second.token }); assert.equal(stranger.response.status, 404);
  let cancelled = await call(`/reservations/${result.data.reservation._id}/cancel`, { method: 'PATCH', token: user.token }); assert.equal(cancelled.data.reservation.status, 'cancelled');
  current = (await search()).find(x => x.id === first.id); assert.equal(current.quantity, original);
  assert.equal((await call(`/reservations/${result.data.reservation._id}/cancel`, { method: 'PATCH', token: user.token })).response.status, 409);
  result = await reserve(2); assert.equal(result.response.status, 201);
  changed = await call(`/reservations/${result.data.reservation._id}/status`, { method: 'PATCH', token: pharmacy.token, body: { status: 'rejected' } }); assert.equal(changed.data.reservation.status, 'rejected');
  current = (await search()).find(x => x.id === first.id); assert.equal(current.quantity, original);
  assert.equal((await call(`/reservations/${result.data.reservation._id}/status`, { method: 'PATCH', token: pharmacy.token, body: { status: 'rejected' } })).response.status, 409);
  assert.equal((await call(`/reservations/${result.data.reservation._id}/cancel`, { method: 'PATCH', token: user.token })).response.status, 409);
  assert.equal((await reserve(0)).response.status, 400); assert.equal((await reserve(original + 1)).response.status, 409);
  const history = (await call('/reservations/mine', { token: user.token })).data.reservations; assert.equal(history.length, 2);
  const otherPharmacy = (await call('/auth/register', { method: 'POST', body: { name: 'Other Pharmacy', email: 'other@pharmacy.test', password: 'AnotherPass123!', role: 'pharmacy' } })).data;
  const wrongPharmacy = await call(`/reservations/${history[0]._id}/status`, { method: 'PATCH', token: otherPharmacy.token, body: { status: 'confirmed' } }); assert.equal(wrongPharmacy.response.status, 404);
}));
test('reservation dialog waits for explicit confirmation and cancel makes no reservation request', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/main.jsx'), 'utf8');
  assert.ok(source.includes("setReserveItem(item); setReserveQuantity(1); setModal('reserve')"));
  assert.ok(source.includes('onSubmit={confirmReservation}'));
  const reserveStart = source.indexOf('  function reserve(item)'); const confirmStart = source.indexOf('  async function confirmReservation'); const cancelStart = source.indexOf('  async function cancelReservation');
  assert.ok(reserveStart >= 0 && confirmStart > reserveStart && cancelStart > confirmStart);
  assert.equal(source.slice(reserveStart, confirmStart).includes("request('/reservations'"), false);
  assert.equal(source.slice(confirmStart, cancelStart).includes("request('/reservations'"), true);
});
test('simultaneous demo reservations cannot overbook the last available stock', async () => withApi(async base => {
  const loginResponse = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user@demo.medifind.test', password: 'DemoPass123!' }) });
  const user = await loginResponse.json();
  const searchResponse = await fetch(`${base}/api/medicines/search?q=Paracetamol`); const results = (await searchResponse.json()).results;
  const item = results.find(x => x.pharmacy.name === 'GreenCross Pharmacy'); const lastUnits = item.quantity;
  const attempts = await Promise.all([1, 2].map(() => fetch(`${base}/api/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` }, body: JSON.stringify({ inventoryId: item.id, quantity: lastUnits }) })));
  assert.deepEqual(attempts.map(response => response.status).sort(), [201, 409]);
  const after = await (await fetch(`${base}/api/medicines/search?q=Paracetamol`)).json();
  assert.ok(!after.results.some(x => x.id === item.id), 'no units remain after one whole-stock reservation');
}));



