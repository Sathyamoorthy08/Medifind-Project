const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { searchTerms } = require('./search');
const { buildAvailabilityReport } = require('./availabilityAssistant');
const router = express.Router();
const safeUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, pharmacy: u.pharmacy || null });
const storeFor = req => req.app.locals.demoStore;
const tokenFor = u => jwt.sign({ sub: u._id, demo: true }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
function protect(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = [...storeFor(req).users.values()].find(x => x._id === payload.sub);
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    req.user = user; next();
  } catch { return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' }); }
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'You do not have permission to do that.' });
const pharmacyOf = (store, item) => store.pharmacies.find(p => p._id === item.pharmacy);
router.get('/health', (req, res) => res.json({ status: 'ok', database: 'demo-memory', demo: true, message: 'MongoDB unavailable; using fictional in-memory demo data. Changes reset when the API restarts.' }));
router.post('/auth/register', async (req, res) => {
  const { name, email, password, role = 'user' } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!name?.trim() || !cleanEmail.includes('@') || !cleanEmail.split('@')[1]?.includes('.') || typeof password !== 'string' || password.length < 8 || !['user', 'pharmacy'].includes(role)) return res.status(400).json({ error: 'Enter a name, valid email, password (8+ characters), and valid account type.' });
  const store = storeFor(req);
  if ([...store.users.values()].some(u => u.email === cleanEmail)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const user = { _id: crypto.randomUUID(), name: name.trim(), email: cleanEmail, role, passwordHash: await bcrypt.hash(password, 10), pharmacy: null };
  store.users.set(cleanEmail, user); res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
});
router.post('/auth/login', async (req, res) => {
  const user = storeFor(req).users.get(String(req.body?.email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(req.body?.password || '', user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: tokenFor(user), user: safeUser(user) });
});
router.get('/auth/me', protect, (req, res) => res.json({ user: safeUser(req.user) }));
router.get('/pharmacies', (req, res) => { const city = String(req.query.city || '').toLowerCase(); res.json({ pharmacies: storeFor(req).pharmacies.filter(p => !city || p.city.toLowerCase().includes(city)) }); });
router.post('/pharmacies', protect, allow('pharmacy'), (req, res) => {
  const { name, address, city, phone, lat, lng } = req.body || {};
  if (!name || !address || !city || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'Name, address, city, latitude and longitude are required.' });
  const pharmacy = { _id: crypto.randomUUID(), name, address, city, phone, location: { lat: Number(lat), lng: Number(lng) }, isDemo: false, confirmedAt: new Date().toISOString() };
  storeFor(req).pharmacies.push(pharmacy); req.user.pharmacy = pharmacy._id; res.status(201).json({ pharmacy });
});
function mapListing(store, item) {
  const p = pharmacyOf(store, item);
  return { id: item._id, medicine: item.medicine, genericName: item.genericName, activeIngredient: item.activeIngredient, category: item.category, strength: item.strength, form: item.form, price: item.price, quantity: item.quantity, pharmacy: p && { id: p._id, _id: p._id, name: p.name, address: p.address, city: p.city, phone: p.phone, location: p.location }, distanceKm: null, stockStatus: item.quantity < 5 ? 'Low stock' : 'Available', isDemo: item.isDemo || p?.isDemo, stockLabel: (item.isDemo || p?.isDemo) ? 'Fictional demo inventory' : 'Pharmacy reported — call to confirm' };
}
router.get('/medicines/search', (req, res) => {
  const terms = searchTerms(req.query.q).map(x => x.toLowerCase());
  if (!terms.length) return res.json({ results: [] });
  const store = storeFor(req);
  const results = store.inventory.filter(i => i.quantity > 0 && terms.some(t => [i.medicine, i.genericName, i.activeIngredient, i.category].some(v => String(v || '').toLowerCase().includes(t)))).slice(0, 100).map(i => mapListing(store, i)).filter(x => x.pharmacy);
  res.json({ results });
});
router.get('/medicines/availability-assistant', (req, res) => {
  const store = storeFor(req);
  const report = buildAvailabilityReport(String(req.query.q || ''), store.inventory, store.pharmacies, req.query.pharmacyId || '', req.query.pharmacyName || '');
  res.json(report);
});router.get('/inventory', protect, allow('pharmacy'), (req, res) => res.json({ inventory: storeFor(req).inventory.filter(i => i.pharmacy === req.user.pharmacy) }));
router.post('/inventory', protect, allow('pharmacy'), (req, res) => {
  if (!req.user.pharmacy) return res.status(400).json({ error: 'Create your pharmacy profile before adding stock.' });
  const { medicine, genericName, activeIngredient, category, strength, form, price, quantity } = req.body || {};
  if (!medicine?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) return res.status(400).json({ error: 'Medicine, non-negative price, and whole-number quantity are required.' });
  const item = { _id: crypto.randomUUID(), pharmacy: req.user.pharmacy, medicine: medicine.trim(), genericName, activeIngredient, category: category || 'Other', strength, form, price: Number(price), quantity: Number(quantity), isDemo: false, updatedByPharmacyAt: new Date().toISOString() };
  item.id = item._id; storeFor(req).inventory.push(item); res.status(201).json({ item });
});
router.patch('/inventory/:id', protect, allow('pharmacy'), (req, res) => {
  const item = storeFor(req).inventory.find(x => x._id === req.params.id && x.pharmacy === req.user.pharmacy);
  if (!item) return res.status(404).json({ error: 'Inventory item not found.' });
  for (const k of ['medicine', 'genericName', 'activeIngredient', 'category', 'strength', 'form']) if (typeof req.body?.[k] === 'string') item[k] = req.body[k];
  for (const k of ['price', 'quantity']) if (req.body?.[k] !== undefined) { const n = Number(req.body[k]); if (!Number.isFinite(n) || n < 0 || (k === 'quantity' && !Number.isInteger(n))) return res.status(400).json({ error: `Invalid ${k}.` }); item[k] = n; }
  item.isDemo = false; item.updatedByPharmacyAt = new Date().toISOString(); res.json({ item });
});
router.delete('/inventory/:id', protect, allow('pharmacy'), (req, res) => { const store = storeFor(req); const index = store.inventory.findIndex(x => x._id === req.params.id && x.pharmacy === req.user.pharmacy); if (index < 0) return res.status(404).json({ error: 'Inventory item not found.' }); store.inventory.splice(index, 1); res.json({ message: 'Inventory item removed.' }); });
router.post('/reservations', protect, (req, res) => {
  if (req.user.role !== 'user') return res.status(403).json({ error: 'Only medicine seeker accounts can create reservations.' });
  const amount = Number(req.body?.quantity); const store = storeFor(req);
  if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ error: 'Reservation quantity must be a positive whole number.' });
  const item = store.inventory.find(x => x._id === req.body?.inventoryId);
  if (!item || item.quantity < amount) return res.status(409).json({ error: 'This amount is no longer available. Refresh search and try again.' });
  item.quantity -= amount;
  const reservation = { _id: crypto.randomUUID(), id: null, user: req.user._id, pharmacy: item.pharmacy, inventory: item._id, medicine: item.medicine, quantity: amount, unitPrice: item.price, totalPrice: Number((item.price * amount).toFixed(2)), status: 'pending', stockRestoredAt: null, code: `MF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`, createdAt: new Date().toISOString() };
  reservation.id = reservation._id; store.reservations.push(reservation); res.status(201).json({ reservation });
});
router.get('/reservations/mine', protect, (req, res) => { const store = storeFor(req); const reservations = store.reservations.filter(r => r.user === req.user._id).map(r => ({ ...r, pharmacy: store.pharmacies.find(p => p._id === r.pharmacy) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); res.json({ reservations }); });
router.get('/reservations/pharmacy', protect, allow('pharmacy'), (req, res) => { const store = storeFor(req); const reservations = store.reservations.filter(r => r.pharmacy === req.user.pharmacy).map(r => ({ ...r, user: [...store.users.values()].find(u => u._id === r.user) && safeUser([...store.users.values()].find(u => u._id === r.user)) })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); res.json({ reservations }); });
router.patch('/reservations/:id/cancel', protect, (req, res) => {
  const store = storeFor(req); const reservation = store.reservations.find(r => r._id === req.params.id && r.user === req.user._id);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
  if (!['pending', 'confirmed'].includes(reservation.status) || reservation.stockRestoredAt) return res.status(409).json({ error: 'Only pending or confirmed reservations may be cancelled before collection.' });
  reservation.status = 'cancelled'; reservation.stockRestoredAt = new Date().toISOString();
  const item = store.inventory.find(i => i._id === reservation.inventory); if (item) item.quantity += reservation.quantity;
  res.json({ reservation, message: 'Reservation cancelled and reserved quantity released.' });
});
router.patch('/reservations/:id/status', protect, allow('pharmacy'), (req, res) => {
  const store = storeFor(req); const reservation = store.reservations.find(r => r._id === req.params.id && r.pharmacy === req.user.pharmacy);
  if (!['confirmed', 'rejected'].includes(req.body?.status)) return res.status(400).json({ error: 'Status must be confirmed or rejected.' });
  if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
  if (reservation.status !== 'pending') return res.status(409).json({ error: 'Only pending reservations can be updated.' });
  reservation.status = req.body.status;
  if (reservation.status === 'rejected' && !reservation.stockRestoredAt) { reservation.stockRestoredAt = new Date().toISOString(); const item = store.inventory.find(i => i._id === reservation.inventory); if (item) item.quantity += reservation.quantity; }
  res.json({ reservation });
});
module.exports = router;


