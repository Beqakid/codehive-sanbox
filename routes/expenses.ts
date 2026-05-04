import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Expense, Category, CreateExpenseInput, UpdateExpenseInput } from '../models/expense';
import { readJsonFile, writeJsonFile } from '../utils/fileStorage';
import { validateExpenseInput } from '../utils/validation';

const router = Router();
const EXPENSES_FILE = 'data/expenses.json';

// Helper to read expenses safely (returns [] if file not found)
async function readExpenses(): Promise<Expense[]> {
  try {
    return await readJsonFile<Expense[]>(EXPENSES_FILE);
  } catch {
    return [];
  }
}

// POST /expenses — Create a new expense
router.post('/expenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const input: CreateExpenseInput = req.body;
    const validation = validateExpenseInput(input);

    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.errors.join(', ') });
      return;
    }

    const expenses = await readExpenses();

    const newExpense: Expense = {
      id: uuidv4(),
      amount: Number(input.amount),
      date: new Date(input.date).toISOString(),
      description: input.description.trim(),
      category: input.category,
    };

    expenses.push(newExpense);
    await writeJsonFile<Expense[]>(EXPENSES_FILE, expenses);

    res.status(201).json({ success: true, data: newExpense });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /expenses — List all expenses
router.get('/expenses', async (req: Request, res: Response): Promise<void> => {
  try {
    const expenses = await readExpenses();
    res.status(200).json({ success: true, data: expenses });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// PUT /expenses/:id — Update an expense
router.put('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const input: UpdateExpenseInput = req.body;

    const validation = validateExpenseInput(input);
    if (!validation.valid) {
      res.status(400).json({ success: false, error: validation.errors.join(', ') });
      return;
    }

    const expenses = await readExpenses();
    const index = expenses.findIndex((e) => e.id === id);

    if (index === -1) {
      res.status(404).json({ success: false, error: 'Expense not found' });
      return;
    }

    const existing = expenses[index];
    const updated: Expense = {
      ...existing,
      ...(input.amount !== undefined && { amount: Number(input.amount) }),
      ...(input.date !== undefined && { date: new Date(input.date).toISOString() }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.category !== undefined && { category: input.category }),
    };

    expenses[index] = updated;
    await writeJsonFile<Expense[]>(EXPENSES_FILE, expenses);

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /expenses/:id — Delete an expense
router.delete('/expenses/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const expenses = await readExpenses();
    const index = expenses.findIndex((e) => e.id === id);

    if (index === -1) {
      res.status(404).json({ success: false, error: 'Expense not found' });
      return;
    }

    const deleted = expenses[index];
    const remaining = expenses.filter((e) => e.id !== id);
    await writeJsonFile<Expense[]>(EXPENSES_FILE, remaining);

    res.status(200).json({ success: true, data: { id: deleted.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /summary — Monthly expense summary
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.query;

    if (!month || typeof month !== 'string') {
      res.status(400).json({ success: false, error: 'Query parameter "month" is required' });
      return;
    }

    const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthPattern.test(month)) {
      res.status(400).json({
        success: false,
        error: 'Invalid "month" format. Expected YYYY-MM (e.g. 2025-06)',
      });
      return;
    }

    const expenses = await readExpenses();
    const filtered = expenses.filter((e) => e.date.substring(0, 7) === month);

    const totals: Record<Category, number> = {
      [Category.Food]: 0,
      [Category.Transport]: 0,
      [Category.Entertainment]: 0,
      [Category.Bills]: 0,
    };

    for (const expense of filtered) {
      if (totals[expense.category] !== undefined) {
        totals[expense.category] = Math.round((totals[expense.category] + expense.amount) * 100) / 100;
      }
    }

    const grandTotal = Math.round(
      Object.values(totals).reduce((sum, val) => sum + val, 0) * 100
    ) / 100;

    res.status(200).json({ success: true, data: { month, totals, grandTotal } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
