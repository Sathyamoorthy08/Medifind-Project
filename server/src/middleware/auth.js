const jwt = require('jsonwebtoken');
const { User } = require('../models');
async function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }

  const user = await User.findById(payload.sub).select('-passwordHash');
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  req.user = user;
  next();
}
const allow = (...roles) => (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'You do not have permission to do that.' });
module.exports = { auth, allow };
