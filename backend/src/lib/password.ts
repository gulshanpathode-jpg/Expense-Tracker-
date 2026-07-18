import { z } from 'zod';

// Shared password policy: at least 8 characters, containing at least one letter
// and one digit. Kept deliberately simple so it's easy to communicate to users.
export const PASSWORD_MIN = 8;
export const PASSWORD_RULE_MESSAGE = 'Password must be at least 8 characters and include a letter and a number';

export function isStrongPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN && /[A-Za-z]/.test(value) && /\d/.test(value);
}

export const passwordSchema = z
  .string()
  .refine(isStrongPassword, { message: PASSWORD_RULE_MESSAGE });
