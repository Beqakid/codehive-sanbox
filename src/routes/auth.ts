import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readJsonFile } from '../utils/fileStorage';
import { validateLoginInput } from '../utils/validation';
import { User } from '../models/user';

const router = Router();

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;

  const validationResult = validateLoginInput({ username, password });
  if (!validationResult.valid) {
    res.status(400).json({ success: false, error: validationResult.errors.join(', ') });
    return;
  }

  let user: User;
  try {
    user = await readJsonFile<User>('data/user.json');
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to read user data.' });
    return;
  }

  if (!user || !user.username || !user.password) {
    res.status(500).json({ success: false, error: 'User data is corrupted or missing.' });
    return;
  }

  if (username !== user.username) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  let passwordMatch: boolean;
  try {
    passwordMatch = await bcrypt.compare(password, user.password);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error verifying credentials.' });
    return;
  }

  if (!passwordMatch) {
    res.status(401).json({ success: false, error: 'Invalid credentials.' });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    res.status(500).json({ success: false, error: 'JWT secret is not configured.' });
    return;
  }

  let token: string;
  try {
    token = jwt.sign(
      { username: user.username },
      jwtSecret,
      { expiresIn: '7d' }
    );
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to generate token.' });
    return;
  }

  res.status(200).json({ success: true, data: { token } });
});

export default router;
