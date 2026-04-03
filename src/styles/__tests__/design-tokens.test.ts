/**
 * Regression tests — Design System V2 Token Foundation
 *
 * Verifies:
 * 1. CSS custom properties are defined with correct values
 * 2. Legacy hex values are absent from component source files
 * 3. Old CSS variable names are absent from component source files
 *
 * These tests run against source file content, not the live DOM, so they
 * don't require a browser environment.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'src');

// ─── helpers ────────────────────────────────────────────────────────────────

function readTokenFile(): string {
  return fs.readFileSync(path.join(SRC, 'styles', 'tokens.css'), 'utf-8');
}

function getAllSourceFiles(): string[] {
  const result: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip test directories for legacy-color checks
        if (!entry.name.includes('__tests__')) walk(full);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        if (!entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) {
          result.push(full);
        }
      }
    }
  }
  walk(SRC);
  return result;
}

function readAllSourceContent(): string {
  return getAllSourceFiles().map(f => fs.readFileSync(f, 'utf-8')).join('\n');
}

// ─── Token definition tests ──────────────────────────────────────────────────

describe('CSS token definitions', () => {
  let tokens: string;
  beforeAll(() => { tokens = readTokenFile(); });

  const expectedTokens = [
    ['--bg-canvas', '#121417'],
    ['--bg-base', '#15181c'],
    ['--bg-subtle', '#181c20'],
    ['--bg-elevated-1', '#1c2126'],
    ['--bg-elevated-2', '#21262c'],
    ['--bg-elevated-3', '#262c33'],
    ['--text-primary', '#e8eaed'],
    ['--text-secondary', '#b9c0c7'],
    ['--text-tertiary', '#8d96a0'],
    ['--text-muted', '#6f7781'],
    ['--border-subtle', '#242a30'],
    ['--border-default', '#2c333a'],
    ['--border-strong', '#38414a'],
    ['--accent-primary', '#B8441E'],
    ['--accent-hover', '#C9521F'],
    ['--accent-pressed', '#A33A1A'],
    ['--star-dim', '#8d96a0'],
    ['--star-default', '#b9c0c7'],
    ['--star-bright', '#e8eaed'],
    ['--surface-light', '#faf8f4'],
  ];

  test.each(expectedTokens)('token %s is defined with value %s', (token, value) => {
    expect(tokens).toContain(token);
    expect(tokens).toContain(value);
  });

  test('legacy alias --color-deep-bg points to --bg-canvas', () => {
    expect(tokens).toMatch(/--color-deep-bg:\s*var\(--bg-canvas\)/);
  });

  test('legacy alias --color-surface points to --bg-base', () => {
    expect(tokens).toMatch(/--color-surface:\s*var\(--bg-base\)/);
  });

  test('legacy alias --color-surface-elevated points to --bg-elevated-1', () => {
    expect(tokens).toMatch(/--color-surface-elevated:\s*var\(--bg-elevated-1\)/);
  });

  test('legacy alias --color-copper points to --accent-primary', () => {
    expect(tokens).toMatch(/--color-copper:\s*var\(--accent-primary\)/);
  });
});

// ─── No legacy hex values in component files ─────────────────────────────────

describe('no legacy hex values in component source', () => {
  let allContent: string;
  beforeAll(() => { allContent = readAllSourceContent(); });

  const legacyHexValues = [
    '#0A0C12',
    '#0d1a2a',
    '#3F3A42',
    '#023061',  // common typo variant
    '#c45a2d',
    '#b8c8e0',
    '#d4e0f0',
    '#edf2fa',
  ];

  test.each(legacyHexValues)('legacy color %s is not in component files', (hex) => {
    // Allow occurrence in comments (lines starting with //)
    const lines = allContent.split('\n').filter(l => {
      const trimmed = l.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    }).join('\n');
    expect(lines).not.toContain(hex);
  });

  test('old deep-blue category pill color #023661 is not used in component files', () => {
    const lines = allContent.split('\n').filter(l => {
      const trimmed = l.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    }).join('\n');
    expect(lines).not.toContain('#023661');
  });
});

// ─── No standalone old CSS var names in component files ──────────────────────

describe('no legacy CSS variable names in component source', () => {
  let allContent: string;
  beforeAll(() => { allContent = readAllSourceContent(); });

  // These old var names should not appear in component files
  // (they live as aliases in tokens.css only)
  const legacyVarNames = [
    'var(--color-deep-bg)',
    'var(--color-surface-elevated)',
    'var(--color-surface-light)',
    'var(--color-copper)',
    'var(--color-copper-deep)',
    'var(--color-copper-glow)',
    'var(--color-night-text-primary)',
    'var(--color-night-text-secondary)',
    'var(--color-night-text-tertiary)',
    'var(--color-star-dim)',
    'var(--color-star-default)',
    'var(--color-star-bright)',
    'var(--color-edge-strong)',
    'var(--color-edge-medium)',
    'var(--color-edge-weak)',
  ];

  test.each(legacyVarNames)('legacy var %s is not used in component files', (varName) => {
    expect(allContent).not.toContain(varName);
  });
});
