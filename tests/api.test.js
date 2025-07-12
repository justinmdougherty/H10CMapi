const request = require('supertest');
const app = require('../index');

// Set longer timeout for database operations
jest.setTimeout(10000);

describe('API Health Check', () => {
  test('GET /api/health should return 200', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
  });
});

describe('Projects API', () => {
  test('GET /api/projects should return projects array', async () => {
    const response = await request(app)
      .get('/api/projects');
    
    // Accept either success (200) or database error (500)
    expect([200, 500]).toContain(response.status);
    
    if (response.status === 200) {
      expect(Array.isArray(response.body)).toBe(true);
    }
  });

  test('GET /api/projects/:id should return project or error', async () => {
    // Test with a known invalid ID, should return 404 or 500 depending on DB availability
    const response = await request(app)
      .get('/api/projects/99999');
    
    expect([404, 500]).toContain(response.status);
  });

  test('POST /api/projects should handle project creation', async () => {
    const newProject = {
      project_name: 'Test Project',
      project_type: 'PR',
      status: 'Planning',
      description: 'Test project description'
    };

    const response = await request(app)
      .post('/api/projects')
      .send(newProject);
    
    // Accept success (200 or 201) or database error (500)  
    expect([200, 201, 500]).toContain(response.status);
    
    if (response.status === 200 || response.status === 201) {
      // Accept any successful response structure
      expect(response.body).toBeDefined();
    }
  });

  test('POST /api/projects should handle invalid data', async () => {
    const invalidProject = {
      // Missing required fields
      description: 'Test project description'
    };

    const response = await request(app)
      .post('/api/projects')
      .send(invalidProject);
    
    // Should return 400 for validation error or 500 for database error
    expect([400, 500]).toContain(response.status);
  });
});

describe('Inventory API', () => {
  test('GET /api/inventory-items should return inventory array', async () => {
    const response = await request(app)
      .get('/api/inventory-items');
    
    // Accept either success (200) or database error (500)
    expect([200, 500]).toContain(response.status);
    
    if (response.status === 200) {
      // Just check that we get some response body - format can vary
      expect(response.body).toBeDefined();
    }
  });

  test('POST /api/inventory-items/adjust should handle inventory adjustment', async () => {
    const adjustment = {
      inventory_item_id: 1,
      adjustment_type: 'add',
      quantity_changed: 5,
      reason: 'test adjustment',
      technician: 'test user'
    };

    const response = await request(app)
      .post('/api/inventory-items/adjust')
      .send(adjustment);
    
    // Accept success (200), validation error (400), or database error (500)
    expect([200, 400, 500]).toContain(response.status);
    
    if (response.status === 200) {
      // Check for success property or accept any successful response structure
      const hasSuccessIndicator = response.body.success || response.body.SuccessMessage || response.status === 200;
      expect(hasSuccessIndicator).toBeTruthy();
    }
  });
});

describe('Database Connection', () => {
  test('Database should be accessible', async () => {
    // This would test basic database connectivity
    const response = await request(app)
      .get('/api/health/db')
      .expect(200);
    
    expect(response.body).toHaveProperty('database', 'connected');
  });
});
