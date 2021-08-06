var express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

dotenv.config();

var app = express();
const appPort = 3003;

app.get('/revalidator-proxy', (req, res) => {
  return res.status(200).send("Hello world");
});

app.get('/internal/isAlive', (req, res) => {
  return res.status(200).send('Ok!');
});

app.get('/internal/isReady', (req, res) => {
  return res.status(200).send('Ok!');
});

const server = app.listen(appPort, () => {
  console.log(`Server starting on port ${appPort}`);
});

const shutdown = () => {
  console.log('Server shutting down');

  server.close(() => {
    console.log('Shutdown complete!');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
