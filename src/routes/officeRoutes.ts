import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getOffices, searchOffices } from '../services/officeService.js';

export const router = express.Router();

// Get all offices
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const offices = await getOffices();
    res.json(offices);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch offices' });
  }
});

// Search offices
router.get('/search', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter is required' });
      return;
    }
    const results = await searchOffices(query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search offices' });
  }
});

