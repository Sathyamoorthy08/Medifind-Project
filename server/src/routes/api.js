const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Pharmacy, Inventory, Reservation } = require('../models');
const { auth, allow } = require('../middleware/auth');
const { searchTerms } = require('../search');
const { buildAvailabilityReport } = require('../availabilityAssistant');
const router = express.Router();
const safeUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, pharmacy: u.pharmacy });
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
router.get('/health', (req, res) => res.json({ status: 'ok', database: req.app.locals.dbReady ? 'connected' : 'disconnected', demo: false }));
router.post('/auth/register', async (req, res) => {
 const { name, email, password, role = 'user' } = req.body || {};
 const cleanName = typeof name === 'string' ? name.trim() : '';
 const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
 if (!cleanName || !cleanEmail.includes('@') || !cleanEmail.split('@')[1]?.includes('.') || typeof password !== 'string' || password.length < 8 || !['user', 'pharmacy'].includes(role)) return res.status(400).json({ error: 'Enter a name, valid email, password (8+ characters), and valid account type.' });
 try { const user = await User.create({ name: cleanName, email: cleanEmail, passwordHash: await bcrypt.hash(password, 12), role }); const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }); res.status(201).json({ token, user: safeUser(user) }); }
 catch (e) { if (e.code === 11000) return res.status(409).json({ error: 'An account with that email already exists.' }); throw e; }
});
router.post('/auth/login', async (req, res) => {
 const { email, password } = req.body || {};
 const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
 if (!cleanEmail || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });
 const user = await User.findOne({ email: cleanEmail });
 if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
 const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
 res.json({ token, user: safeUser(user) });
});
router.get('/auth/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));
router.get('/pharmacies', async (req, res) => { const q = {}; if (req.query.city) q.city = new RegExp(escapeRegex(String(req.query.city)), 'i'); res.json({ pharmacies: await Pharmacy.find(q).sort({ name: 1 }) }); });
router.post('/pharmacies', auth, allow('pharmacy'), async (req, res) => { const { name, address, city, phone, lat, lng } = req.body || {}; if (!name || !address || !city || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return res.status(400).json({ error: 'Name, address, city, latitude and longitude are required.' }); const pharmacy = await Pharmacy.create({ name, address, city, phone, location: { lat: Number(lat), lng: Number(lng) }, isDemo: false, confirmedAt: new Date() }); req.user.pharmacy = pharmacy._id; await req.user.save(); res.status(201).json({ pharmacy }); });
function listing(i) { const p = i.pharmacy; return { id: i.id, medicine: i.medicine, genericName: i.genericName, activeIngredient: i.activeIngredient, category: i.category, strength: i.strength, form: i.form, price: i.price, quantity: i.quantity, pharmacy: { id: p.id, name: p.name, address: p.address, city: p.city, phone: p.phone, location: p.location }, distanceKm: null, stockStatus: i.quantity < 5 ? 'Low stock' : 'Available', isDemo: i.isDemo || p.isDemo, stockLabel: (i.isDemo || p.isDemo) ? 'Fictional demo inventory' : 'Pharmacy reported — call to confirm' }; }
router.get('/medicines/search', async (req, res) => {
 const terms = searchTerms(req.query.q); if (!terms.length) return res.json({ results: [] });
 const matches = terms.flatMap(term => { const safe = escapeRegex(term); return [{ medicine: new RegExp(safe, 'i') }, { genericName: new RegExp(safe, 'i') }, { activeIngredient: new RegExp(safe, 'i') }, { category: new RegExp(safe, 'i') }]; });
 const items = await Inventory.find({ quantity: { $gt: 0 }, $or: matches }).populate('pharmacy').limit(100);
 res.json({ results: items.filter(i => i.pharmacy).map(listing) });
});
router.get('/medicines/availability-assistant', async (req, res) => {
 const items = await Inventory.find().populate('pharmacy');
 const pharmacies = items.filter(item => item.pharmacy).map(item => item.pharmacy);
 res.json(buildAvailabilityReport(String(req.query.q || ''), items, pharmacies, req.query.pharmacyId || '', req.query.pharmacyName || ''));
});router.get('/inventory', auth, allow('pharmacy'), async (req, res) => { if (!req.user.pharmacy) return res.json({ inventory: [] }); res.json({ inventory: await Inventory.find({ pharmacy: req.user.pharmacy }).sort({ medicine: 1 }) }); });
router.post('/inventory', auth, allow('pharmacy'), async (req, res) => { if (!req.user.pharmacy) return res.status(400).json({ error: 'Create your pharmacy profile before adding stock.' }); const { medicine, genericName, activeIngredient, category, strength, form, price, quantity } = req.body || {}; if (!medicine?.trim() || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) return res.status(400).json({ error: 'Medicine, non-negative price, and whole-number quantity are required.' }); const item = await Inventory.create({ pharmacy: req.user.pharmacy, medicine: medicine.trim(), genericName, activeIngredient, category: category || 'Other', strength, form, price: Number(price), quantity: Number(quantity), isDemo: false, updatedByPharmacyAt: new Date() }); res.status(201).json({ item }); });
router.patch('/inventory/:id', auth, allow('pharmacy'), async (req, res) => { const patch = {}; for (const k of ['medicine', 'genericName', 'activeIngredient', 'category', 'strength', 'form']) if (typeof req.body?.[k] === 'string') patch[k] = req.body[k]; for (const k of ['price', 'quantity']) if (req.body?.[k] !== undefined) { const n = Number(req.body[k]); if (!Number.isFinite(n) || n < 0 || (k === 'quantity' && !Number.isInteger(n))) return res.status(400).json({ error: `Invalid ${k}.` }); patch[k] = n; } const item = await Inventory.findOneAndUpdate({ _id: req.params.id, pharmacy: req.user.pharmacy }, { $set: { ...patch, isDemo: false, updatedByPharmacyAt: new Date() } }, { new: true, runValidators: true }); if (!item) return res.status(404).json({ error: 'Inventory item not found.' }); res.json({ item }); });
router.delete('/inventory/:id', auth, allow('pharmacy'), async (req, res) => { const item = await Inventory.findOneAndDelete({ _id: req.params.id, pharmacy: req.user.pharmacy }); if (!item) return res.status(404).json({ error: 'Inventory item not found.' }); res.json({ message: 'Inventory item removed.' }); });
router.post('/reservations', auth, async (req, res) => { if (req.user.role !== 'user') return res.status(403).json({ error: 'Only medicine seeker accounts can create reservations.' }); const { inventoryId, quantity } = req.body || {}; const amount = Number(quantity); if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ error: 'Reservation quantity must be a positive whole number.' }); const item = await Inventory.findOneAndUpdate({ _id: inventoryId, quantity: { $gte: amount } }, { $inc: { quantity: -amount } }, { new: true }); if (!item) return res.status(409).json({ error: 'This amount is no longer available. Refresh search and try again.' }); try { const reservation = await Reservation.create({ user: req.user._id, pharmacy: item.pharmacy, inventory: item._id, medicine: item.medicine, quantity: amount, unitPrice: item.price, totalPrice: Number((item.price * amount).toFixed(2)), code: `MF-${crypto.randomBytes(3).toString('hex').toUpperCase()}` }); res.status(201).json({ reservation }); } catch (e) { await Inventory.updateOne({ _id: item._id }, { $inc: { quantity: amount } }); throw e; } });
router.get('/reservations/mine', auth, async (req, res) => res.json({ reservations: await Reservation.find({ user: req.user._id }).populate('pharmacy', 'name address city isDemo').sort({ createdAt: -1 }) }));
router.get('/reservations/pharmacy', auth, allow('pharmacy'), async (req, res) => { if (!req.user.pharmacy) return res.json({ reservations: [] }); res.json({ reservations: await Reservation.find({ pharmacy: req.user.pharmacy }).populate('user', 'name email').sort({ createdAt: -1 }) }); });
router.patch('/reservations/:id/cancel', auth, async (req, res) => {
 const updated = await Reservation.findOneAndUpdate({ _id: req.params.id, user: req.user._id, status: { $in: ['pending', 'confirmed'] }, stockRestoredAt: null }, { $set: { status: 'cancelled', stockRestoredAt: new Date() } }, { new: true });
 if (!updated) { const exists = await Reservation.exists({ _id: req.params.id, user: req.user._id }); if (!exists) return res.status(404).json({ error: 'Reservation not found.' }); return res.status(409).json({ error: 'Only pending or confirmed reservations may be cancelled before collection.' }); }
 const restored = await Inventory.updateOne({ _id: updated.inventory }, { $inc: { quantity: updated.quantity } });
 if (restored.matchedCount !== 1) return res.status(503).json({ error: 'Reservation was cancelled, but its inventory item could not be restored. Contact the pharmacy.' });
 res.json({ reservation: updated, message: 'Reservation cancelled and reserved quantity released.' });
});
router.patch('/reservations/:id/status', auth, allow('pharmacy'), async (req, res) => {
 const nextStatus = req.body?.status; if (!['confirmed', 'rejected'].includes(nextStatus)) return res.status(400).json({ error: 'Status must be confirmed or rejected.' });
 const filter = { _id: req.params.id, pharmacy: req.user.pharmacy, status: 'pending' };
 const update = nextStatus === 'rejected' ? { $set: { status: 'rejected', stockRestoredAt: new Date() } } : { $set: { status: 'confirmed' } };
 const reservation = await Reservation.findOneAndUpdate(filter, update, { new: true });
 if (!reservation) { const exists = await Reservation.exists({ _id: req.params.id, pharmacy: req.user.pharmacy }); if (!exists) return res.status(404).json({ error: 'Reservation not found.' }); return res.status(409).json({ error: 'Only pending reservations can be updated.' }); }
 if (nextStatus === 'rejected') { const restored = await Inventory.updateOne({ _id: reservation.inventory }, { $inc: { quantity: reservation.quantity } }); if (restored.matchedCount !== 1) return res.status(503).json({ error: 'Reservation was rejected, but its inventory item could not be restored. Contact support.' }); }
 res.json({ reservation });
});
module.exports = router;


