const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'local-test-secret-with-at-least-32-characters-long';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
const app = require('../src/app');
async function withServer(run) { const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve)); try { await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); } }
test('REST health, 404, and auth guard respond over HTTP', async () => withServer(async base => {
 const health = await fetch(`${base}/api/health`); assert.equal(health.status, 200); assert.equal((await health.json()).status, 'ok');
 const missing = await fetch(`${base}/api/not-a-route`); assert.equal(missing.status, 404); assert.equal((await missing.json()).error, 'Route not found.');
 const protectedRoute = await fetch(`${base}/api/inventory`); assert.equal(protectedRoute.status, 401); assert.match((await protectedRoute.json()).error, /Sign in/);
}));
