const test = require('node:test');
const assert = require('node:assert/strict');
const { pharmacies, medicines } = require('../src/seed');
const models = require('../src/models');
test('fictional seed data has coordinates and at least 20 complete medicine entries', () => {
  assert.ok(pharmacies.length >= 3); assert.ok(medicines.length >= 20);
  for (const p of pharmacies) assert.ok(Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng));
  for (const m of medicines) { assert.ok(m.medicine && m.genericName && m.activeIngredient && m.category && m.form); assert.ok(m.price >= 0 && Number.isInteger(m.quantity) && m.quantity >= 0); }
});
test('all required Mongoose models are defined', () => assert.deepEqual(Object.keys(models).sort(), ['Inventory', 'Pharmacy', 'Reservation', 'User']));
