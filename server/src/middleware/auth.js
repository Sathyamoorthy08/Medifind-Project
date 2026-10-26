const jwt = require('jsonwebtoken');
const { User } = require('../models');
async function auth(req, res, next) { try { const token = req.headers.authorization?.replace(/^Bearer\s+/i, ''); if (!token) return res.status(401).json({ error: 'Sign in to continue.' }); const payload = jwt.verify(token, process.env.JWT_SECRET); req.user = await User.findById(payload.sub).select('-passwordHash'); if (!req.user) return res.status(401).json({ error: 'Account not found.' }); next(); } catch { return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' }); } }
const allow = (...roles) => (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'You do not have permission to do that.' });
module.exports = { auth, allow };
