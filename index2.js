// -----------------------------------------------------------------------------
// SETUP & DEPENDENCIES
// -----------------------------------------------------------------------------
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const { logger, requestLogger, responseLogger, isDebugging } = require('./src/debug');

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// MIDDLEWARE
// -----------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// Add the logging middleware if debugging is enabled
if (isDebugging) {
    app.use(requestLogger);
    app.use(responseLogger);
}

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
    logger('DB_CONNECT', 'Successfully connected to SQL Server');
    app.locals.db = pool;
}).catch(err => {
    logger('DB_CONNECT_ERROR', 'Database Connection Failed!', err);
    console.error('Database Connection Failed!', err);
});

// -----------------------------------------------------------------------------
// API HELPER FUNCTIONS
// -----------------------------------------------------------------------------

const executeProcedure = async (res, procedureName, params = []) => {
    logger('EXEC_PROCEDURE', `Executing ${procedureName} with params:`, params);
    try {
        const pool = res.app.locals.db;
        if (!pool) {
            logger('DB_ERROR', 'Database service is temporarily unavailable.');
            return res.status(503).json({ error: "Database service is temporarily unavailable." });
        }

        const request = pool.request();
        params.forEach(param => {
            request.input(param.name, param.type, param.value);
        });

        const result = await request.execute(procedureName);
        
        res.setHeader('Content-Type', 'application/json');

        if (result.recordset && result.recordset.length > 0) {
            const jsonString = result.recordset[0][Object.keys(result.recordset[0])[0]];
            if (!jsonString) {
                logger('EXEC_PROCEDURE_RESULT', `${procedureName} returned no JSON string. Sending empty array.`)
                return res.status(200).send('[]');
            }

            const data = JSON.parse(jsonString);

            if (data.ErrorMessage || data.error) {
                logger('EXEC_PROCEDURE_ERROR', `Procedure ${procedureName} returned an error:`, data);
                return res.status(400).send(JSON.stringify(data, null, 2));
            }
            
            return res.status(200).send(JSON.stringify(data, null, 2));
        } else {
            logger('EXEC_PROCEDURE_RESULT', `${procedureName} returned no records. Sending empty array.`)
            return res.status(200).send('[]');
        }
    } catch (error) {
        logger('EXEC_PROCEDURE_EXCEPTION', `Exception in ${procedureName}:`, error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify({ error: "An internal server error occurred.", details: error.message }, null, 2));
    }
};

const executeView = async (res, viewName) => {
    logger('EXEC_VIEW', `Querying view ${viewName}`);
    try {
        const pool = res.app.locals.db;
        if (!pool) {
            logger('DB_ERROR', 'Database service is temporarily unavailable.');
            return res.status(503).json({ error: "Database service is temporarily unavailable." });
        }
        const result = await pool.request().query(`SELECT * FROM ${viewName}`);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(result.recordset, null, 2));
    } catch (error) {
        logger('EXEC_VIEW_EXCEPTION', `Exception in ${viewName}:`, error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).send(JSON.stringify({ error: "An internal server error occurred.", details: error.message }, null, 2));
    }
};


// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.send('TFPM API is running!');
});

// =============================================================================
// PROJECTS
// =============================================================================

app.get('/api/projects', (req, res) => executeProcedure(res, 'usp_GetProjects'));
app.get('/api/projects/:id', (req, res) => executeProcedure(res, 'usp_GetProjectDetails', [{ name: 'project_id', type: sql.Int, value: req.params.id }]));
app.post('/api/projects', (req, res) => executeProcedure(res, 'usp_SaveProject', [{ name: 'ProjectJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.put('/api/projects/:id', (req, res) => {
    req.body.project_id = parseInt(req.params.id, 10);
    executeProcedure(res, 'usp_SaveProject', [{ name: 'ProjectJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});

// =============================================================================
// INVENTORY ITEMS
// =============================================================================

app.get('/api/inventory-items', (req, res) => executeView(res, 'v_InventoryItems_StockStatus'));
app.get('/api/inventory-items/:id', async (req, res) => {
    logger('GET_INVENTORY_ITEM', `Fetching item with ID: ${req.params.id}`);
    try {
        const pool = app.locals.db;
        const result = await pool.request()
            .input('inventoryItemId', sql.Int, parseInt(req.params.id))
            .query('SELECT * FROM InventoryItems WHERE inventory_item_id = @inventoryItemId');
        
        if (result.recordset.length === 0) {
            logger('GET_INVENTORY_ITEM_NOT_FOUND', `Item with ID: ${req.params.id} not found.`);
            return res.status(404).send(JSON.stringify({ error: 'Inventory item not found.' }, null, 2));
        }
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(result.recordset[0], null, 2));
    } catch (error) {
        logger('GET_INVENTORY_ITEM_ERROR', `Error fetching item ${req.params.id}:`, error);
        res.status(500).send(JSON.stringify({ error: 'Failed to get inventory item.' }, null, 2));
    }
});
app.post('/api/inventory-items', (req, res) => executeProcedure(res, 'usp_SaveInventoryItem', [{ name: 'ItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.put('/api/inventory-items/:id', (req, res) => {
    req.body.inventory_item_id = parseInt(req.params.id, 10);
    executeProcedure(res, 'usp_SaveInventoryItem', [{ name: 'ItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});
app.post('/api/inventory-items/adjust', (req, res) => executeProcedure(res, 'usp_AdjustInventoryStock', [{ name: 'AdjustmentJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.get('/api/inventory-items/:id/transactions', (req, res) => executeProcedure(res, 'usp_GetInventoryTransactionsByItemId', [{ name: 'inventory_item_id', type: sql.Int, value: req.params.id }]));

// =============================================================================
// ATTRIBUTE DEFINITIONS
// =============================================================================

app.get('/api/projects/:projectId/attributes', async (req, res) => {
    logger('GET_ATTRIBUTES', `Fetching attributes for project ID: ${req.params.projectId}`);
    try {
        const pool = app.locals.db;
        const result = await pool.request()
            .input('projectId', sql.Int, parseInt(req.params.projectId))
            .query('SELECT * FROM AttributeDefinitions WHERE project_id = @projectId ORDER BY display_order, attribute_name');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(result.recordset, null, 2));
    } catch (error) {
        logger('GET_ATTRIBUTES_ERROR', `Error fetching attributes for project ${req.params.projectId}:`, error);
        res.status(500).send(JSON.stringify({ error: 'Failed to get attribute definitions.' }, null, 2));
    }
});
app.post('/api/attributes', (req, res) => executeProcedure(res, 'usp_SaveAttributeDefinition', [{ name: 'AttributeJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.put('/api/attributes/:id', (req, res) => {
    req.body.attribute_definition_id = parseInt(req.params.id, 10);
    executeProcedure(res, 'usp_SaveAttributeDefinition', [{ name: 'AttributeJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});
app.delete('/api/attributes/:id', (req, res) => executeProcedure(res, 'usp_DeleteAttributeDefinition', [{ name: 'attribute_definition_id', type: sql.Int, value: req.params.id }]));

// =============================================================================
// PROJECT STEPS
// =============================================================================

app.get('/api/projects/:projectId/steps', async (req, res) => {
    logger('GET_STEPS', `Fetching steps for project ID: ${req.params.projectId}`);
    try {
        const pool = app.locals.db;
        const result = await pool.request()
            .input('projectId', sql.Int, parseInt(req.params.projectId))
            .query('SELECT * FROM ProjectSteps WHERE project_id = @projectId ORDER BY step_order');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(result.recordset, null, 2));
    } catch (error) {
        logger('GET_STEPS_ERROR', `Error fetching steps for project ${req.params.projectId}:`, error);
        res.status(500).send(JSON.stringify({ error: 'Failed to get project steps.' }, null, 2));
    }
});
app.post('/api/steps', (req, res) => executeProcedure(res, 'usp_SaveProjectStep', [{ name: 'StepJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.put('/api/steps/:id', (req, res) => {
    req.body.step_id = parseInt(req.params.id, 10);
    executeProcedure(res, 'usp_SaveProjectStep', [{ name: 'StepJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});
app.delete('/api/steps/:id', (req, res) => executeProcedure(res, 'usp_DeleteProjectStep', [{ name: 'step_id', type: sql.Int, value: req.params.id }]));

// =============================================================================
// STEP INVENTORY REQUIREMENTS
// =============================================================================

app.get('/api/steps/:stepId/inventory-requirements', (req, res) => executeProcedure(res, 'usp_GetStepInventoryRequirementsByStepId', [{ name: 'step_id', type: sql.Int, value: req.params.stepId }]));
app.post('/api/inventory-requirements', (req, res) => executeProcedure(res, 'usp_SaveStepInventoryRequirement', [{ name: 'RequirementJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.put('/api/inventory-requirements/:id', (req, res) => {
    req.body.requirement_id = parseInt(req.params.id, 10);
    executeProcedure(res, 'usp_SaveStepInventoryRequirement', [{ name: 'RequirementJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});
app.delete('/api/inventory-requirements/:id', (req, res) => executeProcedure(res, 'usp_DeleteStepInventoryRequirement', [{ name: 'requirement_id', type: sql.Int, value: req.params.id }]));

// =============================================================================
// TRACKED ITEMS
// =============================================================================

app.get('/api/projects/:projectId/tracked-items', (req, res) => executeProcedure(res, 'usp_GetTrackedItemsByProjectId', [{ name: 'project_id', type: sql.Int, value: req.params.projectId }]));
app.get('/api/tracked-items/:id', (req, res) => executeProcedure(res, 'usp_GetTrackedItemDetails', [{ name: 'item_id', type: sql.Int, value: req.params.id }]));
app.post('/api/tracked-items', (req, res) => executeProcedure(res, 'usp_CreateTrackedItem', [{ name: 'ItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]));
app.post('/api/tracked-items/:id/attributes', (req, res) => {
    req.body.item_id = parseInt(req.params.id, 10);
    executeProcedure(res, 'usp_SaveTrackedItemAttributeValues', [{ name: 'ItemAttributesJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});
app.post('/api/tracked-items/:itemId/steps/:stepId', (req, res) => {
    req.body.item_id = parseInt(req.params.itemId, 10);
    req.body.step_id = parseInt(req.params.stepId, 10);
    executeProcedure(res, 'usp_UpdateTrackedItemStepProgress', [{ name: 'ProgressJson', type: sql.NVarChar, value: JSON.stringify(req.body) }]);
});


// =============================================================================
// VIEW ENDPOINTS
// =============================================================================
app.get('/api/views/inventory-stock-status', (req, res) => executeView(res, 'v_InventoryItems_StockStatus'));
app.get('/api/views/tracked-items-overview', (req, res) => executeView(res, 'v_TrackedItems_Overview'));
app.get('/api/views/step-progress-status', (req, res) => executeView(res, 'v_TrackedItemStepProgress_Status'));


// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    if (isDebugging) {
        console.log('API debugging is enabled. Set API_DEBUG=false to disable.');
    }
});

