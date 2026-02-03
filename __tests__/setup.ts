// Setup file for Jest tests
// Mock localStorage
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};

// Mock TextEncoder and TextDecoder for Next.js environment
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

// Mock ReadableStream for Next.js environment
global.ReadableStream = class MockReadableStream {
  constructor() {}
  getReader() {
    return {
      read: () => Promise.resolve({ done: true, value: undefined }),
      releaseLock: () => {},
    };
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => Promise.resolve({ done: true, value: undefined })
    };
  }
};