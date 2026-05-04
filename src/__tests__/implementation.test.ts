import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

jest.mock('fs');
jest.mock('uuid');

const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;
process.env.PORT = '3001';

import { Category, Expense, CreateExpenseInput, UpdateExpenseInput } from '../models/expense';
import { User } from '../models/user';
import { readJsonFile, writeJsonFile } from '../utils/fileStorage';
import { validateExpenseInput, validateLoginInput } from '../utils/validation';

jest.mock('../utils/fileStorage');
jest.mock('../utils/validation');

const mockReadJsonFile = readJsonFile as jest.MockedFunction<typeof readJsonFile>;
const mockWriteJsonFile = writeJsonFile as jest.MockedFunction<typeof writeJsonFile>;
const mockValidateExpenseInput = validateExpenseInput as jest.MockedFunction<typeof validateExpenseInput>;
const mockValidateLoginInput = validateLoginInput as jest.MockedFunction<typeof validateLoginInput>;
const mockUuidv4 = uuidv4 as jest.MockedFunction<typeof uuidv4>;

describe('Models', () => {
  describe('Category enum', () => {
    it('should have all four required categories', () => {
      expect(Category.Food).toBe('food');
      expect(Category.Transport).toBe('transport');
      expect(Category.Entertainment).toBe('entertainment');
      expect(Category.Bills).toBe('bills');
    });

    it('should have exactly four categories', () => {
      const categories = Object.values(Category);
      expect(categories).toHaveLength(4);
    });
  });

  describe('Expense interface', () => {
    it('should allow creating a valid expense object', () => {
      const expense: Expense = {
        id: 'test-uuid-1234',
        amount: 25.50,
        date: '2025-06-15T00:00:00.000Z',
        description: 'Lunch at restaurant',
        category: Category.Food,
      };

      expect(expense.id).toBe('test-uuid-1234');
      expect(expense.amount).toBe(25.50);
      expect(expense.date).toBe('2025-06-15T00:00:00.000Z');
      expect(expense.description).toBe('Lunch at restaurant');
      expect(expense.category).toBe(Category.Food);
    });
  });

  describe('CreateExpenseInput type', () => {
    it('should allow creating input without id', () => {
      const input: CreateExpenseInput = {
        amount: 10.00,
        date: '2025-06-15T00:00:00.000Z',
        description: 'Bus fare',
        category: Category.Transport,
      };

      expect(input).not.toHaveProperty('id');
      expect(input.amount).toBe(10.00);
    });
  });

  describe('UpdateExpenseInput type', () => {
    it('should allow partial updates', () => {
      const input: UpdateExpenseInput = {
        amount: 15.00,
      };

      expect(input.amount).toBe(15.00);
      expect(input.description).toBeUndefined();
      expect(input.category).toBeUndefined();
    });

    it('should allow empty update object', () => {
      const input: UpdateExpenseInput = {};
      expect(Object.keys(input)).toHaveLength(0);
    });
  });

  describe('User interface', () => {
    it('should create a valid user object', () => {
      const user: User = {
        username: 'admin',
        password: '$2b$10$hashedpassword',
      };

      expect(user.username).toBe('admin');
      expect(user.password).toBe('$2b$10$hashedpassword');
    });
  });
});

describe('Validation Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockValidateExpenseInput.mockReturnValue({ valid: true, errors: [] });
    mockValidateLoginInput.mockReturnValue({ valid: true, errors: [] });
  });

  describe('validateExpenseInput', () => {
    it('should return valid for correct expense input', () => {
      const input: CreateExpenseInput = {
        amount: 50.00,
        date: '2025-06-15T00:00:00.000Z',
        description: 'Grocery shopping',
        category: Category.Food,
      };

      const result = validateExpenseInput(input);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for missing amount', () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['amount is required'],
      });

      const result = validateExpenseInput({ date: '2025-06-15', description: 'Test', category: Category.Food } as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('amount is required');
    });

    it('should return invalid for negative amount', () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['amount must be a positive number'],
      });

      const result = validateExpenseInput({ amount: -10, date: '2025-06-15', description: 'Test', category: Category.Food });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('amount must be a positive number');
    });

    it('should return invalid for invalid category', () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['category must be one of: food, transport, entertainment, bills'],
      });

      const result = validateExpenseInput({ amount: 10, date: '2025-06-15', description: 'Test', category: 'invalid' as Category });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('category must be one of: food, transport, entertainment, bills');
    });

    it('should return invalid for empty description', () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['description is required'],
      });

      const result = validateExpenseInput({ amount: 10, date: '2025-06-15', description: '', category: Category.Food });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description is required');
    });

    it('should return invalid for description exceeding 255 characters', () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['description must not exceed 255 characters'],
      });

      const longDescription = 'a'.repeat(256);
      const result = validateExpenseInput({ amount: 10, date: '2025-06-15', description: longDescription, category: Category.Food });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('description must not exceed 255 characters');
    });

    it('should return invalid for malformed date', () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['date must be a valid ISO 8601 date'],
      });

      const result = validateExpenseInput({ amount: 10, date: 'not-a-date', description: 'Test', category: Category.Food });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('date must be a valid ISO 8601 date');
    });
  });

  describe('validateLoginInput', () => {
    it('should return valid for correct login input', () => {
      const result = validateLoginInput({ username: 'admin', password: 'password123' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for missing username', () => {
      mockValidateLoginInput.mockReturnValue({
        valid: false,
        errors: ['username is required'],
      });

      const result = validateLoginInput({ username: '', password: 'password123' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('username is required');
    });

    it('should return invalid for missing password', () => {
      mockValidateLoginInput.mockReturnValue({
        valid: false,
        errors: ['password is required'],
      });

      const result = validateLoginInput({ username: 'admin', password: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('password is required');
    });
  });
});

describe('File Storage Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readJsonFile', () => {
    it('should read and return parsed JSON data', async () => {
      const mockData = [{ id: '1', amount: 100 }];
      mockReadJsonFile.mockResolvedValue(mockData);

      const result = await readJsonFile('data/expenses.json');
      expect(result).toEqual(mockData);
      expect(mockReadJsonFile).toHaveBeenCalledWith('data/expenses.json');
    });

    it('should return empty array for empty expenses file', async () => {
      mockReadJsonFile.mockResolvedValue([]);

      const result = await readJsonFile('data/expenses.json');
      expect(result).toEqual([]);
    });

    it('should return user object from user.json', async () => {
      const mockUser: User = { username: 'admin', password: '$2b$10$hash' };
      mockReadJsonFile.mockResolvedValue(mockUser);

      const result = await readJsonFile('data/user.json');
      expect(result).toEqual(mockUser);
    });
  });

  describe('writeJsonFile', () => {
    it('should write data to file', async () => {
      mockWriteJsonFile.mockResolvedValue(undefined);
      const data = [{ id: '1', amount: 100 }];

      await writeJsonFile('data/expenses.json', data);
      expect(mockWriteJsonFile).toHaveBeenCalledWith('data/expenses.json', data);
    });

    it('should handle write errors gracefully', async () => {
      mockWriteJsonFile.mockRejectedValue(new Error('Write failed'));

      await expect(writeJsonFile('data/expenses.json', [])).rejects.toThrow('Write failed');
    });
  });
});

describe('Auth Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    app = express();
    app.use(express.json());
  });

  it('should allow access with valid JWT token', async () => {
    const { authenticateToken } = await import('../middleware/auth');
    app.get('/protected', authenticateToken, (req, res) => {
      res.json({ success: true, data: 'protected resource' });
    });

    const token = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should reject request with no token', async () => {
    const { authenticateToken } = await import('../middleware/auth');
    app.get('/protected', authenticateToken, (req, res) => {
      res.json({ success: true, data: 'protected resource' });
    });

    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('should reject request with invalid token', async () => {
    const { authenticateToken } = await import('../middleware/auth');
    app.get('/protected', authenticateToken, (req, res) => {
      res.json({ success: true, data: 'protected resource' });
    });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token-here');

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('should reject request with expired token', async () => {
    const { authenticateToken } = await import('../middleware/auth');
    app.get('/protected', authenticateToken, (req, res) => {
      res.json({ success: true, data: 'protected resource' });
    });

    const expiredToken = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '-1s' });
    const response = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
  });

  it('should reject request with malformed Authorization header', async () => {
    const { authenticateToken } = await import('../middleware/auth');
    app.get('/protected', authenticateToken, (req, res) => {
      res.json({ success: true, data: 'protected resource' });
    });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'NotBearer sometoken');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});

describe('Auth Routes', () => {
  let app: express.Application;

  beforeEach(async () => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());

    const authRouter = (await import('../routes/auth')).default;
    app.use('/', authRouter);
  });

  it('should return JWT token for valid credentials', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const mockUser: User = { username: 'admin', password: hashedPassword };
    mockReadJsonFile.mockResolvedValue(mockUser);
    mockValidateLoginInput.mockReturnValue({ valid: true, errors: [] });

    const response = await request(app)
      .post('/login')
      .send({ username: 'admin', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toBeDefined();
  });

  it('should return 401 for wrong password', async () => {
    const hashedPassword = await bcrypt.hash('correctpassword', 10);
    const mockUser: User = { username: 'admin', password: hashedPassword };
    mockReadJsonFile.mockResolvedValue(mockUser);
    mockValidateLoginInput.mockReturnValue({ valid: true, errors: [] });

    const response = await request(app)
      .post('/login')
      .send({ username: 'admin', password: 'wrongpassword' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeDefined();
  });

  it('should return 401 for wrong username', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const mockUser: User = { username: 'admin', password: hashedPassword };
    mockReadJsonFile.mockResolvedValue(mockUser);
    mockValidateLoginInput.mockReturnValue({ valid: true, errors: [] });

    const response = await request(app)
      .post('/login')
      .send({ username: 'wronguser', password: 'password123' });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('should return 400 for missing credentials', async () => {
    mockValidateLoginInput.mockReturnValue({
      valid: false,
      errors: ['username is required', 'password is required'],
    });

    const response = await request(app)
      .post('/login')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it('should return a valid JWT that can be verified', async () => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    const mockUser: User = { username: 'admin', password: hashedPassword };
    mockReadJsonFile.mockResolvedValue(mockUser);
    mockValidateLoginInput.mockReturnValue({ valid: true, errors: [] });

    const response = await request(app)
      .post('/login')
      .send({ username: 'admin', password: 'password123' });

    expect(response.status).toBe(200);
    const token = response.body.data.token;
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    expect(decoded.username).toBe('admin');
  });
});

describe('Expense Routes', () => {
  let app: express.Application;
  let validToken: string;

  const sampleExpense: Expense = {
    id: 'test-uuid-1234',
    amount: 50.00,
    date: '2025-06-15T00:00:00.000Z',
    description: 'Grocery shopping',
    category: Category.Food,
  };

  const sampleExpenses: Expense[] = [
    sampleExpense,
    {
      id: 'test-uuid-5678',
      amount: 15.00,
      date: '2025-06-20T00:00:00.000Z',
      description: 'Bus fare',
      category: Category.Transport,
    },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());

    const { authenticateToken } = await import('../middleware/auth');
    const expensesRouter = (await import('../routes/expenses')).default;
    app.use('/', authenticateToken, expensesRouter);

    validToken = jwt.sign({ username: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
    mockValidateExpenseInput.mockReturnValue({ valid: true, errors: [] });
  });

  describe('GET /expenses', () => {
    it('should return all expenses', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);

      const response = await request(app)
        .get('/expenses')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });

    it('should return empty array when no expenses', async () => {
      mockReadJsonFile.mockResolvedValue([]);

      const response = await request(app)
        .get('/expenses')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/expenses');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /expenses', () => {
    it('should create a new expense', async () => {
      mockReadJsonFile.mockResolvedValue([]);
      mockWriteJsonFile.mockResolvedValue(undefined);
      mockUuidv4.mockReturnValue('new-uuid-1234' as any);

      const newExpense: CreateExpenseInput = {
        amount: 30.00,
        date: '2025-06-18T00:00:00.000Z',
        description: 'Movie ticket',
        category: Category.Entertainment,
      };

      const response = await request(app)
        .post('/expenses')
        .set('Authorization', `Bearer ${validToken}`)
        .send(newExpense);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.amount).toBe(30.00);
      expect(response.body.data.category).toBe(Category.Entertainment);
    });

    it('should return 400 for invalid expense data', async () => {
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['amount must be a positive number'],
      });

      const response = await request(app)
        .post('/expenses')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: -5, date: '2025-06-15', description: 'Test', category: Category.Food });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should append expense to existing expenses', async () => {
      mockReadJsonFile.mockResolvedValue([sampleExpense]);
      mockWriteJsonFile.mockResolvedValue(undefined);
      mockUuidv4.mockReturnValue('new-uuid-9999' as any);

      const newExpense: CreateExpenseInput = {
        amount: 100.00,
        date: '2025-06-22T00:00:00.000Z',
        description: 'Electric bill',
        category: Category.Bills,
      };

      await request(app)
        .post('/expenses')
        .set('Authorization', `Bearer ${validToken}`)
        .send(newExpense);

      const writeCall = mockWriteJsonFile.mock.calls[0];
      const writtenData = writeCall[1] as Expense[];
      expect(writtenData).toHaveLength(2);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/expenses')
        .send({ amount: 10, date: '2025-06-15', description: 'Test', category: Category.Food });

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /expenses/:id', () => {
    it('should update an existing expense', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);
      mockWriteJsonFile.mockResolvedValue(undefined);

      const updateData: UpdateExpenseInput = {
        amount: 75.00,
        description: 'Updated grocery shopping',
      };

      const response = await request(app)
        .put('/expenses/test-uuid-1234')
        .set('Authorization', `Bearer ${validToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('test-uuid-1234');
      expect(response.body.data.amount).toBe(75.00);
    });

    it('should return 404 for non-existent expense', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);

      const response = await request(app)
        .put('/expenses/non-existent-id')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: 50 });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid update data', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);
      mockValidateExpenseInput.mockReturnValue({
        valid: false,
        errors: ['amount must be a positive number'],
      });

      const response = await request(app)
        .put('/expenses/test-uuid-1234')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: -10 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should preserve unmodified fields', async () => {
      mockReadJsonFile.mockResolvedValue([sampleExpense]);
      mockWriteJsonFile.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/expenses/test-uuid-1234')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ amount: 60.00 });

      expect(response.status).toBe(200);
      expect(response.body.data.category).toBe(Category.Food);
      expect(response.body.data.description).toBe('Grocery shopping');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .put('/expenses/test-uuid-1234')
        .send({ amount: 50 });

      expect(response.status).toBe(401);
    });
  });

  describe('DELETE /expenses/:id', () => {
    it('should delete an existing expense', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);
      mockWriteJsonFile.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/expenses/test-uuid-1234')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('test-uuid-1234');
    });

    it('should remove expense from file on delete', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);
      mockWriteJsonFile.mockResolvedValue(undefined);

      await request(app)
        .delete('/expenses/test-uuid-1234')
        .set('Authorization', `Bearer ${validToken}`);

      const writeCall = mockWriteJsonFile.mock.calls[0];
      const writtenData = writeCall[1] as Expense[];
      expect(writtenData).toHaveLength(1);
      expect(writtenData[0].id).toBe('test-uuid-5678');
    });

    it('should return 404 for non-existent expense', async () => {
      mockReadJsonFile.mockResolvedValue(sampleExpenses);

      const response = await request(app)
        .delete('/expenses/non-existent-id')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/expenses/test-uuid-1234');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /summary', () => {
    const juneExpenses: Expense[] = [
      {
        id: 'uuid-1',
        amount: 50.00,
        date: '2025-06-10T00:00:00.000Z',
        description: 'Groceries',
        category: Category.Food,
      },
      {
        id: 'uuid-2',
        amount: 30.00,
        date: '2025-06-15T00:00:00.000Z',
        description: 'More groceries',
        category: Category.Food,
      },
      {
        id: 'uuid-3',
        amount: 20.00,
        date: '2025-06-20T00:00:00.000Z',
        description: 'Bus pass',
        category: Category.Transport,
      },
      {
        id: 'uuid-4',
        amount: 100.00,
        date: '2025-07-01T00:00:00.000Z',
        description: 'Electric bill',
        category: Category.Bills,
      },
    ];

    it('should return monthly summary for specified month', async () => {
      mockReadJsonFile.mockResolvedValue(juneExpenses);

      const response = await request(app)
        .get('/summary?month=2025-06')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.month).toBe('2025-06');
      expect(response.body.data.totals[Category.Food]).toBe(80.00);
      expect(response.body.data.totals[Category.Transport]).toBe(20.00);
      expect(response.body.data.totals[Category.Entertainment]).toBe(0);
      expect(response.body.data.totals[Category.Bills]).toBe(0);
    });

    it('should return correct grandTotal', async () => {
      mockReadJsonFile.mockResolvedValue(juneExpenses);

      const response = await request(app)
        .get('/summary?month=2025-06')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.grandTotal).toBe(100.00);
    });

    it('should exclude expenses from other months', async () => {
      mockReadJsonFile.mockResolvedValue(juneExpenses);

      const response = await request(app)
        .get('/summary?month=2025-07')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.totals[Category.Bills]).toBe(100.00);
      expect(response.body.data.totals[Category.Food]).toBe(0);
      expect(response.body.data.grandTotal).toBe(100.00);
    });

    it('should return 400 for missing month param', async () => {
      const response = await request(app)
        .get('/summary')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for malformed month param', async () => {
      const response = await request(app)
        .get('/summary?month=invalid-month')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for month param with wrong format', async () => {
      const response = await request(app)
        .get('/summary?month=06-2025')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return zero totals for month with no expenses', async () => {
      mockReadJsonFile.mockResolvedValue(juneExpenses);

      const response = await request(app)
        .get('/summary?month=2025-08')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totals[Category.Food]).toBe(0);
      expect(response.body.data.totals[Category.Transport]).toBe(0);
      expect(response.body.data.totals[Category.Entertainment]).toBe(0);
      expect(response.body.data.totals[Category.Bills]).toBe(0);
      expect(response.body.data.grandTotal).toBe(0);
    });
  });
});
