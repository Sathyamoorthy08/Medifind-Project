require('express-async-errors'); const express=require('express'); const cors=require('cors'); const helmet=require('helmet'); const rateLimit=require('express-rate-limit'); const api=require('./routes/api'); const demoApi=require('./demoApi');
const app=express(); app.disable('x-powered-by'); app.use(helmet()); const allowedOrigins = new Set([
  ...(process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(origin => origin.trim()).filter(Boolean),
  'https://medifind-ai.onrender.com'
]);
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) })); app.use(express.json({limit:'20kb'})); app.use('/api/auth',rateLimit({windowMs:900000,limit:30,standardHeaders:'draft-7',legacyHeaders:false})); app.use('/api',(req,res,next)=>(app.locals.demoFallback?demoApi:api)(req,res,next)); app.use((req,res)=>res.status(404).json({error:'Route not found.'})); app.use((err,req,res,next)=>{console.error(err.message);res.status(err.status||500).json({error:process.env.NODE_ENV==='production'?'Something went wrong. Please try again.':(err.message||'Internal server error.')})}); module.exports=app;


