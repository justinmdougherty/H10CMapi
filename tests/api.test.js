const request = require('supertest');
const app = require('../index');

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
      .get('/api/projects')
      .expect(200);
    
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('GET /api/projects/:id should return project or 404', async () => {
    // Test with a known invalid ID
    await request(app)
      .get('/api/projects/99999')
      .expect(404);
  });

  test('POST /api/projects should create project with valid data', async () => {
    const newProject = {
      project_name: 'Test Project',
      project_type: 'PR',
      status: 'Planning',
      description: 'Test project description'
    };

    const response = await request(app)
      .post('/api/projects')
      .send(newProject)
      .expect(201);
    
    expect(response.body).toHaveProperty('project_id');
    expect(response.body.project_name).toBe(newProject.project_name);
  });

  test('POST /api/projects should return 400 for invalid data', async () => {
    const invalidProject = {
      // Missing required fields
      description: 'Test project description'
    };

    await request(app)
      .post('/api/projects')
      .send(invalidProject)
      .expect(400);
  });
});

describe('Inventory API', () => {
  test('GET /api/inventory should return inventory array', async () => {
    const response = await request(app)
      .get('/api/inventory')
      .expect(200);
    
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('POST /api/inventory/adjust should adjust inventory', async () => {
    const adjustment = {
      inventory_id: 1,
      quantity: 10,
      adjustment_type: 'addition',
      reason: 'Purchase Order',
      notes: 'Test adjustment'
    };

    const response = await request(app)
      .post('/api/inventory/adjust')
      .send(adjustment)
      .expect(200);
    
    expect(response.body).toHaveProperty('success', true);
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
