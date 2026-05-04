import express, { Application, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import expenseRoutes from './routes/expenses';
import { authMiddleware } from './middleware/auth';

dotenv.config();

const app: Application = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use('/login', authRoutes);

app.use('/expenses', authMiddleware, expenseRoutes);
app.use('/summary', authMiddleware, expenseRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

export default app;