// Test setup file for API tests
const sql = require('mssql');

// Setup test database connection if needed
beforeAll(async () => {
  // You might want to setup a test database here
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Clean up connections
  try {
    await sql.close();
  } catch (error) {
    console.log('Error closing database connection:', error.message);
  }
  console.log('Cleaning up test environment...');
});

// Mock console.log to reduce noise during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
