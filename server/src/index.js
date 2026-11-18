const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { app } = require('./app');

const port = Number(process.env.PORT || 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

if (
  !process.env.JWT_SECRET
  || process.env.JWT_SECRET.startsWith('replace-with-')
  || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32
) {
  throw new Error('Set JWT_SECRET to a random value of at least 32 bytes before starting the server');
}

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
