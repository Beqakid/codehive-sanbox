import express, { Application, Request, Response } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';

import { authRouter } from './routes/auth.routes';
import { userRouter } from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';

// --- Express App Initialization ---
const app: Application = express();

// --- Security and Middleware ---
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// --- Routes ---
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);

// --- Health Check ---
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// --- 404 Handler ---
app.use((_req, res, _next) => {
  res.status(404).json({ error: 'Not Found' });
});

// --- Centralized Error Handler ---
app.use(errorHandler);

// --- Export for server.ts/entrypoint ---
export { app };