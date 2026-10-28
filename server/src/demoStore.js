const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pharmacies, medicines, demoAccounts } = require('./seed');
async function createDemoStore() {
  const store = { users: new Map(), pharmacies: [], inventory: [], reservations: [] };
  for (let index = 0; index < pharmacies.length; index++) {
    const p = { ...pharmacies[index], _id: crypto.randomUUID(), id: null, isDemo: true, createdAt: new Date().toISOString() }; p.id = p._id; store.pharmacies.push(p);
    for (let i = 0; i < medicines.length; i++) {
      const m = medicines[i];
      const item = { _id: crypto.randomUUID(), id: null, pharmacy: p._id, ...m, price: m.price + (i % 3) * 4, quantity: Math.max(0, m.quantity - (index % 3) * 2), isDemo: true, createdAt: new Date().toISOString() };
      item.id = item._id; store.inventory.push(item);
    }
  }
 for (const data of demoAccounts) { const passwordHash = await bcrypt.hash(data.password, 10); const user = { name: data.name, email: data.email, role: data.role, ...(data.role === 'pharmacy' ? { pharmacy: store.pharmacies[0]._id } : {}), _id: crypto.randomUUID(), id: null, passwordHash, createdAt: new Date().toISOString() }; user.id = user._id; store.users.set(user.email, user); }
  return store;
}
module.exports = { createDemoStore };
