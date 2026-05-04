export enum Category {
  Food = 'food',
  Transport = 'transport',
  Entertainment = 'entertainment',
  Bills = 'bills',
}

export interface Expense {
  id: string;
  amount: number;
  date: string;
  description: string;
  category: Category;
}

export type CreateExpenseInput = Omit<Expense, 'id'>;

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export interface MonthlySummary {
  month: string;
  totals: Record<Category, number>;
  grandTotal: number;
}