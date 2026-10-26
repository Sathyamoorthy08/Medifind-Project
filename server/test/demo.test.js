const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'local-demo-test-secret-that-is-long-enough-0123456789';
const app = require('../src/app');
const { createDemoStore } = require('../src/demoStore');
async function withServer(run) { app.locals.demoStore = await createDemoStore(); app.locals.demoFallback = true; const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); try { await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); } }
test('offline demo supports login, search, reservation, pharmacy confirmation, and inventory', async () => withServer(async base => {
 const call = async (path, options = {}) => { const response = await fetch(`${base}/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.headers || {}) } }); const body = await response.json(); assert.ok(response.ok, `${path}: ${body.error || response.status}`); return body; };
 const userLogin = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'user@demo.medifind.test', password: 'DemoPass123!' }) });
 const found = await call('/medicines/search?q=acetaminophen'); assert.ok(found.results.length > 0); assert.equal(found.results[0].stockLabel, 'Fictional demo inventory');
 const first = found.results[0]; const before = first.quantity;
 const created = await call('/reservations', { method: 'POST', token: userLogin.token, body: JSON.stringify({ inventoryId: first.id, quantity: 1 }) }); assert.equal(created.reservation.status, 'pending');
 const userHistory = await call('/reservations/mine', { token: userLogin.token }); assert.equal(userHistory.reservations.length, 1);
 const pharmacyLogin = await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'pharmacy@demo.medifind.test', password: 'DemoPass123!' }) });
 const incoming = await call('/reservations/pharmacy', { token: pharmacyLogin.token }); assert.equal(incoming.reservations.length, 1);
 await call(`/reservations/${created.reservation._id}/status`, { method: 'PATCH', token: pharmacyLogin.token, body: JSON.stringify({ status: 'confirmed' }) });
 const after = await call('/medicines/search?q=paracetamol'); const same = after.results.find(r => r.id === first.id); assert.equal(same.quantity, before - 1);
 const inventory = await call('/inventory', { token: pharmacyLogin.token }); assert.equal(inventory.inventory.length, 21);
}));

