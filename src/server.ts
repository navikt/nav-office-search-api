import express from 'express';
import dotenv from 'dotenv';
import { responseFromPostnrSearch } from './search-postnr.js';
import { responseFromNameSearch } from './search-name.js';

dotenv.config();

const app = express();
const appPort = 3003;

app.get('/api', async (req, res) => {
    const { postnr, text } = req.query;

    if (typeof postnr === 'string') {
        return responseFromPostnrSearch(res, postnr);
    }

    if (typeof text === 'string') {
        return responseFromNameSearch(res, text);
    }

    return res
        .status(400)
        .send("Invalid request - 'postnr' or 'text' parameter required");
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
