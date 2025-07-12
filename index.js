// server.js

// -----------------------------------------------------------------------------
// SETUP & DEPENDENCIES
// -----------------------------------------------------------------------------
const express = require('express');
const sql = require('mssql');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// -----------------------------------------------------------------------------
// DATABASE CONFIGURATION & CONNECTION
// -----------------------------------------------------------------------------
const dbConfig = {
    user: "sa",
    password: "0)Password",
    server: "127.0.0.1",
    database: "TFPM",
    port: 1433,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};

sql.connect(dbConfig).then(pool => {
    console.log('Connected to SQL Server');
    app.locals.db = pool;
}).catch(err => {
    console.error('Database Connection Failed!', err);
});

// -----------------------------------------------------------------------------
// API HELPER FUNCTION (Your existing helper function)
// -----------------------------------------------------------------------------
const executeProcedure = async (res, procedureName, params = []) => {
    try {
        const pool = res.app.locals.db;
        if (!pool) {
            throw new Error("Database not connected. Check your configuration.");
        }
        
        const request = pool.request();
        
        params.forEach(param => {
            request.input(param.name, param.type, param.value);
        });

        const result = await request.execute(procedureName);
        
        res.setHeader('Content-Type', 'application/json');

        if (result.recordset && result.recordset.length > 0 && result.recordset[0][Object.keys(result.recordset[0])[0]]) {
            const jsonResultString = result.recordset[0][Object.keys(result.recordset[0])[0]];
            const data = JSON.parse(jsonResultString);
            
            if (data.error) {
                return res.status(400).send(JSON.stringify(data, null, 2));
            }
            if (data.SuccessMessage || data.WarningMessage) {
                return res.status(200).send(JSON.stringify(data, null, 2));
            }
            
            res.status(200).send(JSON.stringify(data, null, 2));
        } else {
            res.status(200).send('[]');
        }
    } catch (error) {
        console.error(`Error executing procedure ${procedureName}:`, error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify({ error: { ErrorMessage: "An internal server error occurred.", details: error.message } }, null, 2));
    }
};


// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.send('TFPM API is running!');
});

// Health check endpoints for testing
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/health/db', async (req, res) => {
    try {
        const pool = app.locals.db;
        if (pool && pool.connected) {
            res.status(200).json({
                database: 'connected',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                database: 'disconnected',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(503).json({
            database: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================================================
// PROJECTS
// =============================================================================

// GET all projects - <<< THIS IS THE REVISED SECTION >>>
app.get('/api/projects', async (req, res) => {
    try {
        const pool = app.locals.db;
        if (!pool) {
            throw new Error("Database not connected.");
        }
        
        const result = await pool.request().execute('usp_GetProjects');

        if (result.recordset && result.recordset.length > 0) {
            // Extract the single JSON string from the database result.
            const jsonString = result.recordset[0][Object.keys(result.recordset[0])[0]];
            
            // Parse the string into a JavaScript array of project objects.
            let projects = JSON.parse(jsonString);

            // Sort the array numerically by project_id to guarantee order.
            projects.sort((a, b) => a.project_id - b.project_id);
            
            // --- The Fix ---
            // 1. Manually set the Content-Type header to ensure it's treated as JSON.
            res.setHeader('Content-Type', 'application/json');
            
            // 2. Manually stringify the sorted array with pretty-printing (2 spaces).
            //    This sends a clean, formatted string as the response body.
            res.status(200).send(JSON.stringify(projects, null, 2));

        } else {
            // If no data, return an empty array with the correct content type.
            res.setHeader('Content-Type', 'application/json');
            res.status(200).send('[]');
        }
    } catch (error) {
        console.error('Error in /api/projects:', error);
        res.status(500).json({ error: 'Failed to get projects.' });
    }
});

// GET a single project by ID
app.get('/api/projects/:id', async (req, res) => {
    const params = [{ name: 'project_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_GetProjectById', params);
});

// POST (Create) a new project
app.post('/api/projects', async (req, res) => {
    const params = [{ name: 'ProjectJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveProject', params);
});

// PUT (Update) an existing project
app.put('/api/projects/:id', async (req, res) => {
    req.body.project_id = parseInt(req.params.id, 10);
    const params = [{ name: 'ProjectJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveProject', params);
});

// DELETE a project
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const pool = res.app.locals.db;
        if (!pool) {
            throw new Error("Database not connected. Check your configuration.");
        }
        
        const projectId = parseInt(req.params.id, 10);
        console.log(`Deleting project with ID: ${projectId}`);
        
        // Simple delete query - in production you'd want to handle cascading deletes
        const result = await pool.request()
            .input('project_id', sql.Int, projectId)
            .query('DELETE FROM Projects WHERE project_id = @project_id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// GET project attributes
app.get('/api/projects/:projectId/attributes', async (req, res) => {
    try {
        const pool = res.app.locals.db;
        if (!pool) {
            throw new Error("Database not connected. Check your configuration.");
        }
        
        const request = pool.request();
        request.input('project_id', sql.Int, req.params.projectId);
        
        const result = await request.query(`
            SELECT 
                attribute_definition_id,
                project_id,
                attribute_name,
                attribute_type,
                display_order,
                is_required
            FROM AttributeDefinitions
            WHERE project_id = @project_id
            ORDER BY display_order
        `);
        
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(result.recordset, null, 2));
        
    } catch (error) {
        console.error('Error getting project attributes:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify({ error: error.message }, null, 2));
    }
});

// =============================================================================
// INVENTORY ITEMS
// =============================================================================

// GET all inventory items
app.get('/api/inventory-items', async (req, res) => {
    await executeProcedure(res, 'usp_GetInventoryItems');
});

// GET a single inventory item by ID
app.get('/api/inventory-items/:id', async (req, res) => {
    const params = [{ name: 'inventory_item_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_GetInventoryItemById', params);
});

// POST (Create) a new inventory item
app.post('/api/inventory-items', async (req, res) => {
    const params = [{ name: 'ItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveInventoryItem', params);
});

// PUT (Update) an existing inventory item
app.put('/api/inventory-items/:id', async (req, res) => {
    req.body.inventory_item_id = parseInt(req.params.id, 10);
    const params = [{ name: 'ItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveInventoryItem', params);
});

// POST to manually adjust inventory stock
app.post('/api/inventory-items/adjust', async (req, res) => {
    const params = [{ name: 'AdjustmentJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_AdjustInventoryStock', params);
});

// GET inventory transactions for a specific item
app.get('/api/inventory-items/:id/transactions', async (req, res) => {
    const params = [{ name: 'inventory_item_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_GetInventoryTransactionsByItemId', params);
});


// =============================================================================
// ATTRIBUTE DEFINITIONS
// =============================================================================

// GET all attribute definitions for a specific project
app.get('/api/projects/:projectId/attributes', async (req, res) => {
    const params = [{ name: 'project_id', type: sql.Int, value: req.params.projectId }];
    await executeProcedure(res, 'usp_GetAttributeDefinitionsByProjectId', params);
});

// POST (Create) a new attribute definition
app.post('/api/attributes', async (req, res) => {
    const params = [{ name: 'AttributeJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveAttributeDefinition', params);
});

// PUT (Update) an existing attribute definition
app.put('/api/attributes/:id', async (req, res) => {
    req.body.attribute_definition_id = parseInt(req.params.id, 10);
    const params = [{ name: 'AttributeJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveAttributeDefinition', params);
});

// DELETE an attribute definition
app.delete('/api/attributes/:id', async (req, res) => {
    const params = [{ name: 'attribute_definition_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_DeleteAttributeDefinition', params);
});

// =============================================================================
// PROJECT STEPS
// =============================================================================

// GET all steps for a specific project
app.get('/api/projects/:projectId/steps', async (req, res) => {
    const params = [{ name: 'project_id', type: sql.Int, value: req.params.projectId }];
    await executeProcedure(res, 'usp_GetProjectStepsByProjectId', params);
});

// POST (Create) a new project step
app.post('/api/steps', async (req, res) => {
    const params = [{ name: 'StepJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveProjectStep', params);
});

// PUT (Update) an existing project step
app.put('/api/steps/:id', async (req, res) => {
    req.body.step_id = parseInt(req.params.id, 10);
    const params = [{ name: 'StepJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveProjectStep', params);
});

// DELETE a project step
app.delete('/api/steps/:id', async (req, res) => {
    const params = [{ name: 'step_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_DeleteProjectStep', params);
});


// =============================================================================
// STEP INVENTORY REQUIREMENTS
// =============================================================================

// GET all inventory requirements for a specific step
app.get('/api/steps/:stepId/inventory-requirements', async (req, res) => {
    const params = [{ name: 'step_id', type: sql.Int, value: req.params.stepId }];
    await executeProcedure(res, 'usp_GetStepInventoryRequirementsByStepId', params);
});

// POST (Create) a new step inventory requirement
app.post('/api/inventory-requirements', async (req, res) => {
    const params = [{ name: 'RequirementJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveStepInventoryRequirement', params);
});

// DELETE a step inventory requirement
app.delete('/api/inventory-requirements/:id', async (req, res) => {
    const params = [{ name: 'requirement_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_DeleteStepInventoryRequirement', params);
});

// =============================================================================
// TRACKED ITEMS
// =============================================================================

// GET all tracked items for a specific project (with attributes)
app.get('/api/projects/:projectId/tracked-items', async (req, res) => {
    try {
        console.log(`🔍 API: Fetching tracked items for project ${req.params.projectId}`);
        
        const pool = app.locals.db;
        if (!pool) {
            throw new Error("Database not connected.");
        }
        
        // First, get the basic tracked items data using stored procedure
        const request = pool.request();
        request.input('project_id', sql.Int, req.params.projectId);
        
        const result = await request.execute('usp_GetTrackedItemsByProjectId');
        
        let trackedItems = [];
        
        if (result.recordset && result.recordset.length > 0) {
            const jsonString = result.recordset[0][Object.keys(result.recordset[0])[0]];
            // Check if jsonString is not null, undefined, or empty before parsing
            if (jsonString) { 
                try {
                    const parsedData = JSON.parse(jsonString);
                    
                    // Handle different response formats from the stored procedure
                    if (Array.isArray(parsedData)) {
                        trackedItems = parsedData;
                    } else if (parsedData.data && Array.isArray(parsedData.data)) {
                        trackedItems = parsedData.data;
                    } else {
                        console.log('📭 API: Unexpected data format from stored procedure, but handled.');
                        trackedItems = []; // Default to empty array
                    }
                } catch (parseError) {
                    console.error('❌ API: JSON parsing failed.', parseError);
                    console.log('Raw string from DB:', jsonString);
                    trackedItems = []; // Default to empty array on parse error
                }
            } else {
                 console.log('📭 API: Received null or empty JSON string from DB, treating as no items.');
                 trackedItems = [];
            }
        }
        
        console.log(`🔍 API: Found ${trackedItems.length} tracked items, fetching attributes and step statuses...`);
        
        // Now fetch attributes and step statuses for each tracked item
        for (let item of trackedItems) {
            try {
                const attributesRequest = pool.request();
                attributesRequest.input('item_id', sql.Int, item.item_id);
                
                // Get attributes using a direct query to the attributes tables
                const attributesResult = await attributesRequest.query(`
                    SELECT 
                        iav.attribute_definition_id,
                        iav.attribute_value,
                        ad.attribute_name,
                        ad.attribute_type
                    FROM ItemAttributeValues iav
                    INNER JOIN AttributeDefinitions ad ON iav.attribute_definition_id = ad.attribute_definition_id
                    WHERE iav.item_id = @item_id
                `);
                
                // Add attributes array to the item
                item.attributes = attributesResult.recordset.map(attr => ({
                    attribute_definition_id: attr.attribute_definition_id,
                    attribute_value: attr.attribute_value,
                    attribute_name: attr.attribute_name,
                    attribute_type: attr.attribute_type
                }));
                
                // Get step statuses for the item
                const stepStatusRequest = pool.request();
                stepStatusRequest.input('item_id', sql.Int, item.item_id);
                
                const stepStatusResult = await stepStatusRequest.query(`
                    SELECT 
                        step_id as stepId,
                        status,
                        completion_timestamp,
                        completed_by_user_name
                    FROM dbo.TrackedItemStepProgress
                    WHERE item_id = @item_id
                `);
                
                // Add step_statuses array to the item
                item.step_statuses = stepStatusResult.recordset.map(step => ({
                    stepId: step.stepId,
                    status: step.status,
                    completion_timestamp: step.completion_timestamp,
                    completed_by_user_name: step.completed_by_user_name
                }));
                
                console.log(`🔍 API: Item ${item.item_id} has ${item.attributes.length} attributes and ${item.step_statuses.length} step statuses`);
                
            } catch (attrError) {
                console.warn(`❌ API: Failed to fetch attributes or step statuses for item ${item.item_id}:`, attrError.message);
                // Set empty arrays if fetch fails
                item.attributes = [];
                item.step_statuses = [];
            }
        }
        
        console.log(`✅ API: Returning ${trackedItems.length} tracked items with attributes and step statuses included`);
        
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify({ data: trackedItems }, null, 2));
        
    } catch (error) {
        console.error('❌ API: Error in /api/projects/:projectId/tracked-items:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify({ error: 'Failed to get tracked items.' }, null, 2));
    }
});

// GET full details for a single tracked item
app.get('/api/tracked-items/:id', async (req, res) => {
    const params = [{ name: 'item_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_GetTrackedItemDetails', params);
});

// POST (Create) a new tracked item (which also inits steps)
app.post('/api/tracked-items', async (req, res) => {
    const params = [{ name: 'TrackedItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_CreateTrackedItem', params);
});

// PUT to update the general details of a tracked item
app.put('/api/tracked-items/:id', async (req, res) => {
    req.body.item_id = parseInt(req.params.id, 10);
    const params = [{ name: 'DetailsJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_UpdateTrackedItemDetails', params);
});

// POST to save (update/insert) attribute values for a tracked item
app.post('/api/tracked-items/:id/attributes', async (req, res) => {
    req.body.item_id = parseInt(req.params.id, 10);
    const params = [{ name: 'ValuesJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveItemAttributeValues', params);
});

// POST to update the progress of a single step for a tracked item
app.post('/api/tracked-items/:itemId/steps/:stepId', async (req, res) => {
    req.body.item_id = parseInt(req.params.itemId, 10);
    req.body.step_id = parseInt(req.params.stepId, 10);
    const params = [{ name: 'ProgressJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_UpdateTrackedItemStepProgress', params);
});

// PUT (Update) step progress for a tracked item - same functionality as POST for compatibility
app.put('/api/tracked-items/:itemId/steps/:stepId', async (req, res) => {
    req.body.item_id = parseInt(req.params.itemId, 10);
    req.body.step_id = parseInt(req.params.stepId, 10);
    const params = [{ name: 'ProgressJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_UpdateTrackedItemStepProgress', params);
});

// POST to batch update step progress for multiple tracked items (DEADLOCK PREVENTION)
app.post('/api/tracked-items/batch-step-progress', async (req, res) => {
    try {
        const { itemIds, stepId, status, completed_by_user_name } = req.body;
        
        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ error: 'itemIds array is required and must not be empty' });
        }
        
        if (!stepId) {
            return res.status(400).json({ error: 'stepId is required' });
        }
        
        if (!status) {
            return res.status(400).json({ error: 'status is required' });
        }

        const pool = res.app.locals.db;
        if (!pool) {
            throw new Error("Database not connected. Check your configuration.");
        }

        console.log(`🔄 Processing batch step progress update for ${itemIds.length} items, step ${stepId}, status: ${status}`);
        
        const results = [];
        const errors = [];
        
        // Process items sequentially to avoid deadlocks
        for (const itemId of itemIds) {
            const maxRetries = 3;
            let retryCount = 0;
            let success = false;
            
            while (retryCount < maxRetries && !success) {
                try {
                    const progressData = {
                        item_id: parseInt(itemId, 10),
                        step_id: parseInt(stepId, 10),
                        status: status,
                        completed_by_user_name: completed_by_user_name
                    };
                    
                    const request = pool.request();
                    request.input('ProgressJson', sql.NVarChar, JSON.stringify(progressData));
                    
                    await request.execute('usp_UpdateTrackedItemStepProgress');
                    
                    results.push({ itemId, success: true });
                    success = true;
                    console.log(`✅ Successfully updated item ${itemId}`);
                    
                } catch (error) {
                    retryCount++;
                    
                    // Check if it's a deadlock error (error number 1205)
                    if (error.number === 1205 && retryCount < maxRetries) {
                        // Exponential backoff with jitter
                        const baseDelay = 100 * Math.pow(2, retryCount - 1);
                        const jitter = Math.random() * 50;
                        const delay = baseDelay + jitter;
                        
                        console.log(`⚠️ Deadlock detected for item ${itemId}, retrying in ${Math.round(delay)}ms (attempt ${retryCount}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    
                    // If it's not a deadlock or we've exhausted retries, record the error
                    console.error(`❌ Failed to update item ${itemId} after ${retryCount} attempts:`, error.message);
                    errors.push({ 
                        itemId, 
                        error: error.message, 
                        attempts: retryCount 
                    });
                    break;
                }
            }
        }
        
        const response = {
            success: results.length,
            failed: errors.length,
            total: itemIds.length,
            results,
            errors: errors.length > 0 ? errors : undefined
        };
        
        console.log(`📊 Batch update completed: ${results.length}/${itemIds.length} successful`);
        
        // Return success if at least some items were updated
        if (results.length > 0) {
            res.status(200).json(response);
        } else {
            res.status(500).json(response);
        }
        
    } catch (error) {
        console.error('❌ Error in batch step progress update:', error);
        res.status(500).json({ 
            error: 'Failed to process batch step progress update',
            details: error.message 
        });
    }
});

// -----------------------------------------------------------------------------
// VIEW ENDPOINTS
// =============================================================================
const executeView = async (res, viewName) => {
    try {
        const pool = res.app.locals.db;
        if (!pool) {
            throw new Error("Database not connected. Check your configuration.");
        }
        const result = await pool.request().query(`SELECT * FROM ${viewName}`);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(result.recordset, null, 2));
    } catch (error) {
        console.error(`Error querying view ${viewName}:`, error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify({ error: error.message }, null, 2));
    }
}

app.get('/api/views/inventory-stock-status', (req, res) => executeView(res, 'v_InventoryItems_StockStatus'));
app.get('/api/views/tracked-items-overview', (req, res) => executeView(res, 'v_TrackedItems_Overview'));
app.get('/api/views/step-progress-status', (req, res) => executeView(res, 'v_TrackedItemStepProgress_Status'));


// -----------------------------------------------------------------------------
// START SERVER (only if not in test environment)
// -----------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

// Export the app for testing
module.exports = app;