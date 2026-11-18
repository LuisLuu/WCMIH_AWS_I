const cors = require('cors');
const express = require('express');
const authenticateToken = require('./api/middlewares/auth');
const healthRouter = require('./api/routes/health');
const { chatRouter, handleCancel } = require('./api/routes/chat');

const app = express();
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

app.use((req, res, next) => {
  const origin = req.get('Origin');

  if (origin && origin !== frontendOrigin) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  return next();
});

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());
app.use('/api', healthRouter);
app.use('/api', chatRouter);

// Root level cancel endpoint alias
app.post('/cancel', handleCancel);
app.get('/cancel', handleCancel);

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = { app, authenticateToken };
