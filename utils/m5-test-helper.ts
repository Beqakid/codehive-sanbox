/**
 * M5 Test Helper — Created by CodeHive M5 E2E validation
 * Exports test utilities for validation purposes.
 */
export const M5_TEST_VERSION = '5.0.0-e2e'

export function getGreeting(name: string): string {
  return `Hello from CodeHive M5, ${name}!`
}

export function isM5Ready(): boolean {
  return true
}
