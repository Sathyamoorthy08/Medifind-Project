require('dotenv').config({ path: process.env.ENV_FILE || 'server/.env' });
const mongoose = require('mongoose');
const app = require('./app');
const { createDemoStore } = require('./demoStore');
const port = Number(process.env.PORT || 5000);
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) { console.error('JWT_SECRET must be set to at least 32 characters. Copy server/.env.example to server/.env.'); process.exit(1); }
async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  try { await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 3500) }); app.locals.dbReady = true; app.locals.demoFallback = false; console.log('Connected to MongoDB.'); }
  catch (error) { if (process.env.DEMO_MODE !== 'true') throw error; app.locals.demoStore = await createDemoStore(); app.locals.demoFallback = true; app.locals.dbReady = false; console.warn(`MongoDB unavailable (${error.message}). Starting with fictional in-memory demo data; changes reset on restart.`); }
  const server = app.listen(port, () => console.log(`MediFind API listening at http://localhost:${port} (${app.locals.demoFallback ? 'demo-memory' : 'MongoDB'})`));
  const shutdown = async () => { server.close(); await mongoose.disconnect().catch(() => {}); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  return server;
}
if (require.main === module) start().catch(e => { console.error(`Startup failed: ${e.message}`); process.exit(1); });
module.exports = { start };
