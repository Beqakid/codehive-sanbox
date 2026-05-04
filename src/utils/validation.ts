/**
 * Validation utilities for the Expense Tracker API.
 * Provides input validation for expenses and login requests.
 */

import { Category } from '../models/expense';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

type ExpenseInput = {
  amount?: unknown;
  date?: unknown;
  description?: unknown;
  category?: unknown;
};

/**
 * Validates expense input (create or update).
 * For create: all fields are required.
 * For update: validates provided fields only.
 */
export function validateExpenseInput(input: ExpenseInput): ValidationResult {
  const errors: string[] = [];

  if (input.amount === undefined || input.amount === null) {
    errors.push('amount is required');
  } else if (typeof input.amount !== 'number' || input.amount <= 0) {
    errors.push('amount must be a positive number');
  }

  if (input.date !== undefined) {
    if (!input.date) {
      errors.push('date is required');
    } else if (typeof input.date === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(input.date)) {
      errors.push('date must be a valid ISO 8601 date');
    }
  }

  if (input.description !== undefined) {
    if (input.description === null || input.description === '') {
      errors.push('description is required');
    } else if (typeof input.description === 'string' && input.description.length > 255) {
      errors.push('description must not exceed 255 characters');
    }
  }

  if (input.category !== undefined) {
    const validCategories = Object.values(Category) as string[];
    if (!input.category || !validCategories.includes(input.category as string)) {
      errors.push('category must be one of: food, transport, entertainment, bills');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates login credentials.
 */
export function validateLoginInput(input: { username?: unknown; password?: unknown }): ValidationResult {
  const errors: string[] = [];

  if (!input.username) {
    errors.push('username is required');
  }

  if (!input.password) {
    errors.push('password is required');
  }

  return { valid: errors.length === 0, errors };
}
