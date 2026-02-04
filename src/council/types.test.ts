import { describe, it, expect } from 'bun:test';
import {
  isCouncilDomain,
  isDebatePhase,
  isMemorySourceType,
} from './types';

describe('Council Type Definitions', () => {
  describe('Type Guards - CouncilDomain', () => {
    it('should validate valid CouncilDomain values', () => {
      expect(isCouncilDomain('lifestyle')).toBe(true);
      expect(isCouncilDomain('creative')).toBe(true);
      expect(isCouncilDomain('direction')).toBe(true);
    });

    it('should reject invalid CouncilDomain values', () => {
      expect(isCouncilDomain('invalid')).toBe(false);
      expect(isCouncilDomain('other')).toBe(false);
      expect(isCouncilDomain(null)).toBe(false);
      expect(isCouncilDomain(undefined)).toBe(false);
      expect(isCouncilDomain(123)).toBe(false);
    });
  });

  describe('Type Guards - DebatePhase', () => {
    it('should validate valid DebatePhase values', () => {
      expect(isDebatePhase('position')).toBe(true);
      expect(isDebatePhase('challenge')).toBe(true);
      expect(isDebatePhase('synthesis')).toBe(true);
      expect(isDebatePhase('complete')).toBe(true);
    });

    it('should reject invalid DebatePhase values', () => {
      expect(isDebatePhase('invalid')).toBe(false);
      expect(isDebatePhase('start')).toBe(false);
      expect(isDebatePhase(null)).toBe(false);
      expect(isDebatePhase(undefined)).toBe(false);
      expect(isDebatePhase(123)).toBe(false);
    });
  });

  describe('Type Guards - MemorySourceType', () => {
    it('should validate valid MemorySourceType values', () => {
      expect(isMemorySourceType('debate')).toBe(true);
      expect(isMemorySourceType('user_feedback')).toBe(true);
      expect(isMemorySourceType('observation')).toBe(true);
      expect(isMemorySourceType('seed')).toBe(true);
    });

    it('should reject invalid MemorySourceType values', () => {
      expect(isMemorySourceType('invalid')).toBe(false);
      expect(isMemorySourceType('feedback')).toBe(false);
      expect(isMemorySourceType(null)).toBe(false);
      expect(isMemorySourceType(undefined)).toBe(false);
      expect(isMemorySourceType(123)).toBe(false);
    });
  });

  describe('Type Guard Functions Export', () => {
    it('should export type guard functions', () => {
      expect(typeof isCouncilDomain).toBe('function');
      expect(typeof isDebatePhase).toBe('function');
      expect(typeof isMemorySourceType).toBe('function');
    });

    it('should have correct function signatures', () => {
      expect(isCouncilDomain.length).toBe(1);
      expect(isDebatePhase.length).toBe(1);
      expect(isMemorySourceType.length).toBe(1);
    });
  });

  describe('Type Guard Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(isCouncilDomain('')).toBe(false);
      expect(isDebatePhase('')).toBe(false);
      expect(isMemorySourceType('')).toBe(false);
    });

    it('should handle objects', () => {
      expect(isCouncilDomain({})).toBe(false);
      expect(isDebatePhase({})).toBe(false);
      expect(isMemorySourceType({})).toBe(false);
    });

    it('should handle arrays', () => {
      expect(isCouncilDomain([])).toBe(false);
      expect(isDebatePhase([])).toBe(false);
      expect(isMemorySourceType([])).toBe(false);
    });

    it('should be case-sensitive', () => {
      expect(isCouncilDomain('LIFESTYLE')).toBe(false);
      expect(isDebatePhase('POSITION')).toBe(false);
      expect(isMemorySourceType('DEBATE')).toBe(false);
    });
  });
});
