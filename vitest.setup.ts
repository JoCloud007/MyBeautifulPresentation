import { vi, beforeEach } from "vitest";
import "@testing-library/jest-dom";

// Mock crypto.randomUUID for tests — returns sequential values so tests
// that assert uniqueness still pass while remaining deterministic.
let uuidCounter = 0;
Object.defineProperty(global, "crypto", {
  value: {
    ...global.crypto,
    randomUUID: () => `test-uuid-${++uuidCounter}`,
  },
  writable: true,
  configurable: true,
});

beforeEach(() => {
  // Reset counter before every test to keep IDs predictable within a single test.
  uuidCounter = 0;
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    length: 0,
    key: () => null,
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;
