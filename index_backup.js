// server.js - H10CM Multi-Tenant API

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
    database: "H10CM",  // Updated for new multi-tenant database
    port: 1433,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};

sql.connect(dbConfig).then(pool => {
    console.log('Connected to H10CM Multi-Tenant Database');
    app.locals.db = pool;
}).catch(err => {
    console.error('Database Connection Failed!', err);
});

// -----------------------------------------------------------------------------
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE
// -----------------------------------------------------------------------------

// Extract user information from certificate and get their program access
const authenticateUser = async (req, res, next) => {
    try {
        const pool = req.app.locals.db;
        if (!pool) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        // Get certificate from header or use default
        const clientCert = req.headers['x-arr-clientcert'] || DEFAULT_USER_CERT;
        
        // Extract certificate subject (simplified for this example)
        const certSubject = extractCertificateSubject(clientCert);
        
        // Look up user in database
        const userResult = await pool.request()
            .input('certificate_subject', sql.NVarChar, certSubject)
            .query(`
                SELECT u.user_id, u.user_name, u.display_name, u.is_system_admin,
                       JSON_QUERY((
                           SELECT pa.program_id, pa.access_level, p.program_name, p.program_code
                           FROM ProgramAccess pa 
                           JOIN Programs p ON pa.program_id = p.program_id
                           WHERE pa.user_id = u.user_id AND pa.is_active = 1
                           FOR JSON PATH
                       )) as program_access
                FROM Users u
                WHERE u.certificate_subject = @certificate_subject AND u.is_active = 1
            `);

        if (userResult.recordset.length === 0) {
            return res.status(401).json({ error: 'User not found or not authorized' });
        }

        const user = userResult.recordset[0];
        
        // Parse program access JSON
        user.program_access = user.program_access ? JSON.parse(user.program_access) : [];
        user.accessible_programs = user.program_access.map(p => p.program_id);
        
        // Attach user info to request
        req.user = user;
        
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

// Check if user has access to specific program
const checkProgramAccess = (requiredLevel = 'Read') => {
    return (req, res, next) => {
        const programId = req.params.programId || req.query.program_id || req.body.program_id;
        
        if (!programId) {
            return res.status(400).json({ error: 'Program ID required' });
        }

        // System admins have access to all programs
        if (req.user.is_system_admin) {
            req.programId = parseInt(programId);
            return next();
        }

        // Check user's program access
        const programAccess = req.user.program_access.find(p => p.program_id == programId);
        
        if (!programAccess) {
            return res.status(403).json({ error: 'Access denied to this program' });
        }

        // Check access level
        const accessLevels = { 'Read': 1, 'Write': 2, 'Admin': 3 };
        const userLevel = accessLevels[programAccess.access_level] || 0;
        const requiredAccessLevel = accessLevels[requiredLevel] || 1;

        if (userLevel < requiredAccessLevel) {
            return res.status(403).json({ error: `Insufficient access level. Required: ${requiredLevel}` });
        }

        req.programId = parseInt(programId);
        next();
    };
};

// Helper function to extract certificate subject (simplified)
const extractCertificateSubject = (cert) => {
    // In a real implementation, you'd parse the actual certificate
    // For now, return a default subject for development
    return "CN=DOUGHERTY.JUSTIN.MICHAEL.1250227228,OU=USN,OU=PKI,OU=DoD,O=U.S. Government,C=US";
};

// Filter data by user's accessible programs
const filterByProgramAccess = (data, user) => {
    if (user.is_system_admin) {
        return data; // System admins see all data
    }
    
    return data.filter(item => {
        return user.accessible_programs.includes(item.program_id);
    });
};

// -----------------------------------------------------------------------------
// API HELPER FUNCTIONS
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

// Execute query with program filtering
const executeQuery = async (req, res, query, params = []) => {
    try {
        const pool = req.app.locals.db;
        if (!pool) {
            throw new Error("Database not connected");
        }
        
        const request = pool.request();
        
        params.forEach(param => {
            request.input(param.name, param.type, param.value);
        });

        const result = await request.query(query);
        
        // Filter results by user's program access if not system admin
        let filteredData = result.recordset;
        if (!req.user.is_system_admin && filteredData.length > 0 && filteredData[0].hasOwnProperty('program_id')) {
            filteredData = filterByProgramAccess(filteredData, req.user);
        }
        
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(filteredData);
        
    } catch (error) {
        console.error('Error executing query:', error);
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: error.message });
    }
};


// -----------------------------------------------------------------------------
// API ROUTES
// -----------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.send('H10CM Multi-Tenant API is running!');
});

const DEFAULT_USER_CERT = "MIIFRDCCBCygAwIBAgIDBnVHMA0GCSqGSIb3DQEBCwUAMFoxCzAJBgNVBAYTAlVTMRgwFgYDVQQKEw9VLlMuIEdvdmVybm1lbnQxDDAKBgNVBAsTA0RvRDEMMAoGA1UECxMDUEtJMRUwEwYDVQQDEwxET0QgSUQgQ0EtNzMwHhcNMjQwNzA5MDAwMDAwWhcNMjcwNzA4MjM1OTU5WjB/MQswCQYDVQQGEwJVUzEYMBYGA1UEChMPVS5TLiBHb3Zlcm5tZW50MQwwCgYDVQQLEwNEb0QxDDAKBgNVBAsTA1BLSTEMMAoGA1UECxMDVVNOMSwwKgYDVQQDEyNET1VHSEVSVFkuSlVTVElOLk1JQ0hBRUwuMTI1MDIyNzIyODCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJ98y7xGmNrfVUtSA85i9EzyFfzpWLZvQfWv3KMvE9tdvjYLpi9wf1Mm440NZSdsn+VBSruZyb7s7EWa9Jiw19A4AsHHTm0PDUmIt5WbGPcXsszc/6eL/VEsR2V/gp5mhl96Az5ct/fMIslFhh5UX+H7ma8K56Hwir1vIc/Be80fQBulMwzGHz0vWOyQ0AWDtLWf6VdpYJV+Vjv0SC+H3pgIbEZL91Vwwmd1i8PzHi5BojfQIhI64IQuKqyPcZrLgmA3trNpHPJP8hdw4fe8I+N6TAjH/NkaB2BICis5pIbnmlrUyac60jr9qtavfBNfjtHTC9NQtQSv7+oQzMvqL5kCAwEAAaOCAewwggHoMB8GA1UdIwQYMBaAFOkhe/IUbzhViHqgUAmekXIcS9k7MDcGA1UdHwQwMC4wLKAqoCiGJmh0dHA6Ly9jcmwuZGlzYS5taWwvY3JsL0RPRElEQ0FfNzMuY3JsMA4GA1UdDwEB/wQEAwIHgDAkBgNVHSAEHTAbMAsGCWCGSAFlAgELKjAMBgpghkgBZQMCAQMNMB0GA1UdDgQWBBTjksZ1APK0JkryT88aMZw9hGjSvDBlBggrBgEFBQcBAQRZMFcwMwYIKwYBBQUHMAKGJ2h0dHA6Ly9jcmwuZGlzYS5taWwvc2lnbi9ET0RJRENBXzczLmNlcjAgBggrBgEFBQcwAYYUaHR0cDovL29jc3AuZGlzYS5taWwwgYgGA1UdEQSBgDB+oCcGCGCGSAFlAwYGoBsEGdT4ENs8CGwUVIGtg2DaCKhQjiEChDgQo/OgJAYKKwYBBAGCNxQCA6AWDBQxMjUwMjI3MjI4MTE3MDAyQG1pbIYtdXJuOnV1aWQ6QTQ4NkZFRTctNDE4NS00NTAyLUEzOTQtRDVERUNDRUJBNkUzMBsGA1UdCQQUMBIwEAYIKwYBBQUHCQQxBBMCVVMwKAYDVR0lBCEwHwYKKwYBBAGCNxQCAgYIKwYBBQUHAwIGBysGAQUCAwQwDQYJKoZIhvcNAQELBQADggEBAFc6ZODAlHhmEInPE9vnPpGOYBaFhQ06RDDxft3UDKn9oxB0gxogFAs/5kMIJE+wn9mjazLH/B2VnizUfXarFZcPCP3aziNeVAWH/ZjqMq8PxUvV1PJdVxVJu1cU6XberkTs5dgHNSlAb39Qdl/OQANERHa1pUdCgHscIeGl2TrvprzXD3zf0WsFI57hNeil6KUazf3u3pXuN2P00cv3ryEOw7CzC2IO0Q61Yn/vAjCprVh3IhoIkF0yPrYhUiP5qqTLyhynDynnDYwbnt/ZGQYaLiC+gNFxZwkQJtGHVXlb7WOW0zRZI3QaBSielwK1eawfdq/J2SCtT3YHriwKeaI=";

// =============================================================================
// AUTHENTICATION & USER MANAGEMENT ENDPOINTS
// =============================================================================

app.get("/api/auth/me", authenticateUser, (req, res) => {
  console.log("Headers received:", JSON.stringify(req.headers, null, 2));

  const clientCert = req.headers['x-arr-clientcert'] || DEFAULT_USER_CERT;

  res.json({
    user: {
      user_id: req.user.user_id,
      username: req.user.user_name,
      displayName: req.user.display_name,
      is_system_admin: req.user.is_system_admin,
      program_access: req.user.program_access,
      accessible_programs: req.user.accessible_programs,
      certificateInfo: {
        subject: clientCert,
        issuer: req.headers['x-arr-ssl'] || "",
        serialNumber: ""
      }
    },
    headers: {
      ...req.headers,
      'x-arr-clientcert': clientCert
    },
    extractedFrom: req.headers['x-arr-clientcert'] ? 'certificate' : 'fallback',
    request: {
      ip: req.headers['x-forwarded-for'] || req.ip,
      method: req.method,
      path: req.path,
      protocol: req.protocol,
      secure: req.secure
    }
  });
});

// =============================================================================
// PROGRAM MANAGEMENT ENDPOINTS (ADMIN ONLY)
// =============================================================================

// GET all programs (Admin only or filtered by user access)
app.get('/api/programs', authenticateUser, async (req, res) => {
    try {
        let query = `
            SELECT program_id, program_name, program_code, program_description, 
                   is_active, date_created, program_manager
            FROM Programs 
            WHERE is_active = 1
        `;
        
        // Non-admin users only see their accessible programs
        if (!req.user.is_system_admin && req.user.accessible_programs.length > 0) {
            query += ` AND program_id IN (${req.user.accessible_programs.join(',')})`;
        }
        
        query += ` ORDER BY program_name`;
        
        await executeQuery(req, res, query);
    } catch (error) {
        console.error('Error getting programs:', error);
        res.status(500).json({ error: 'Failed to get programs' });
    }
});

// POST create new program (System Admin only)
app.post('/api/programs', authenticateUser, async (req, res) => {
    if (!req.user.is_system_admin) {
        return res.status(403).json({ error: 'System Admin access required' });
    }
    
    const { program_name, program_code, program_description } = req.body;
    const params = [
        { name: 'ProgramName', type: sql.NVarChar, value: program_name },
        { name: 'ProgramCode', type: sql.NVarChar, value: program_code },
        { name: 'ProgramDescription', type: sql.NVarChar, value: program_description },
        { name: 'CreatedBy', type: sql.NVarChar, value: req.user.user_name }
    ];
    await executeProcedure(res, 'usp_AddNewTenant', params);
});

// POST grant program access to user (System Admin only)
app.post('/api/programs/:programId/access', authenticateUser, async (req, res) => {
    if (!req.user.is_system_admin) {
        return res.status(403).json({ error: 'System Admin access required' });
    }
    
    const { user_id, access_level } = req.body;
    const params = [
        { name: 'UserId', type: sql.Int, value: user_id },
        { name: 'ProgramId', type: sql.Int, value: req.params.programId },
        { name: 'AccessLevel', type: sql.NVarChar, value: access_level },
        { name: 'GrantedBy', type: sql.Int, value: req.user.user_id }
    ];
    await executeProcedure(res, 'usp_GrantProgramAccess', params);
});

// =============================================================================
// PROJECT ENDPOINTS (WITH PROGRAM FILTERING)
// =============================================================================

// GET projects (filtered by user's program access)
app.get('/api/projects', authenticateUser, async (req, res) => {
    try {
        let query = `
            SELECT p.project_id, p.program_id, p.project_name, p.project_description, 
                   p.status, p.priority, pr.program_name, pr.program_code,
                   pm.display_name as project_manager_name,
                   p.date_created, p.last_modified, p.project_start_date, p.project_end_date
            FROM Projects p
            JOIN Programs pr ON p.program_id = pr.program_id
            LEFT JOIN Users pm ON p.project_manager_id = pm.user_id
            WHERE pr.is_active = 1
        `;
        
        // Filter by program access for non-admin users
        if (!req.user.is_system_admin && req.user.accessible_programs.length > 0) {
            query += ` AND p.program_id IN (${req.user.accessible_programs.join(',')})`;
        }
        
        // Filter by specific program if requested
        if (req.query.program_id) {
            query += ` AND p.program_id = ${parseInt(req.query.program_id)}`;
        }
        
        query += ` ORDER BY p.project_name`;
        
        await executeQuery(req, res, query);
    } catch (error) {
        console.error('Error in /api/projects:', error);
        res.status(500).json({ error: 'Failed to get projects.' });
    }
});

// GET a single project by ID (with program access check)
app.get('/api/projects/:id', authenticateUser, async (req, res) => {
    try {
        const query = `
            SELECT p.*, pr.program_name, pr.program_code,
                   pm.display_name as project_manager_name
            FROM Projects p
            JOIN Programs pr ON p.program_id = pr.program_id
            LEFT JOIN Users pm ON p.project_manager_id = pm.user_id
            WHERE p.project_id = @project_id
        `;
        
        const params = [{ name: 'project_id', type: sql.Int, value: req.params.id }];
        
        const pool = req.app.locals.db;
        const request = pool.request();
        params.forEach(param => {
            request.input(param.name, param.type, param.value);
        });
        
        const result = await request.query(query);
        
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const project = result.recordset[0];
        
        // Check program access for non-admin users
        if (!req.user.is_system_admin && !req.user.accessible_programs.includes(project.program_id)) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        
        res.json(project);
    } catch (error) {
        console.error('Error getting project:', error);
        res.status(500).json({ error: 'Failed to get project' });
    }
});

// POST (Create) a new project (with program access validation)
app.post('/api/projects', authenticateUser, checkProgramAccess('Write'), async (req, res) => {
    // Ensure the project is created in the validated program
    req.body.program_id = req.programId;
    req.body.created_by = req.user.user_id;
    
    const params = [{ name: 'ProjectJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveProject', params);
});

// PUT (Update) an existing project (with program access validation)
app.put('/api/projects/:id', authenticateUser, async (req, res) => {
    try {
        // First, verify user has access to this project's program
        const pool = req.app.locals.db;
        const checkResult = await pool.request()
            .input('project_id', sql.Int, req.params.id)
            .query('SELECT program_id FROM Projects WHERE project_id = @project_id');
            
        if (checkResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        const projectProgramId = checkResult.recordset[0].program_id;
        
        // Check program access
        if (!req.user.is_system_admin && !req.user.accessible_programs.includes(projectProgramId)) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        
        // Check write access level
        if (!req.user.is_system_admin) {
            const programAccess = req.user.program_access.find(p => p.program_id === projectProgramId);
            if (!programAccess || programAccess.access_level === 'Read') {
                return res.status(403).json({ error: 'Write access required to update projects' });
            }
        }
        
        req.body.project_id = parseInt(req.params.id, 10);
        req.body.program_id = projectProgramId; // Ensure program_id doesn't change
        
        const params = [{ name: 'ProjectJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
        await executeProcedure(res, 'usp_SaveProject', params);
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// =============================================================================
// TASK ENDPOINTS (WITH PROGRAM FILTERING)
// =============================================================================

// GET tasks (filtered by user's program access)
app.get('/api/tasks', authenticateUser, async (req, res) => {
    try {
        let query = `
            SELECT t.task_id, t.program_id, t.task_title, t.priority, t.status, 
                   t.completion_percentage, t.due_date, t.date_created,
                   assigned_user.display_name AS assigned_to_name,
                   assigner.display_name AS assigned_by_name,
                   p.project_name, pr.program_name
            FROM Tasks t
            LEFT JOIN Users assigned_user ON t.assigned_to = assigned_user.user_id
            LEFT JOIN Users assigner ON t.assigned_by = assigner.user_id
            LEFT JOIN Projects p ON t.project_id = p.project_id
            LEFT JOIN Programs pr ON t.program_id = pr.program_id
            WHERE 1=1
        `;
        
        // Filter by program access for non-admin users
        if (!req.user.is_system_admin && req.user.accessible_programs.length > 0) {
            query += ` AND t.program_id IN (${req.user.accessible_programs.join(',')})`;
        }
        
        // Filter by assigned user if requested
        if (req.query.assigned_to_me === 'true') {
            query += ` AND t.assigned_to = ${req.user.user_id}`;
        }
        
        // Filter by program
        if (req.query.program_id) {
            query += ` AND t.program_id = ${parseInt(req.query.program_id)}`;
        }
        
        // Filter by project
        if (req.query.project_id) {
            query += ` AND t.project_id = ${parseInt(req.query.project_id)}`;
        }
        
        query += ` ORDER BY t.due_date, t.priority DESC`;
        
        await executeQuery(req, res, query);
    } catch (error) {
        console.error('Error getting tasks:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

// POST create new task (with program validation)
app.post('/api/tasks', authenticateUser, checkProgramAccess('Write'), async (req, res) => {
    req.body.program_id = req.programId;
    req.body.assigned_by = req.user.user_id;
    
    const params = [{ name: 'TaskJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveTask', params);
});

// =============================================================================
// INVENTORY ENDPOINTS (WITH PROGRAM FILTERING)
// =============================================================================

// GET inventory items (filtered by user's program access)
app.get('/api/inventory-items', authenticateUser, async (req, res) => {
    try {
        let query = `
            SELECT ii.inventory_item_id, ii.program_id, ii.item_name, ii.part_number, 
                   ii.description, ii.category, ii.unit_of_measure, ii.current_stock_level,
                   ii.reorder_point, ii.cost_per_unit, ii.location, ii.is_active,
                   pr.program_name, pr.program_code
            FROM InventoryItems ii
            JOIN Programs pr ON ii.program_id = pr.program_id
            WHERE ii.is_active = 1 AND pr.is_active = 1
        `;
        
        // Filter by program access for non-admin users
        if (!req.user.is_system_admin && req.user.accessible_programs.length > 0) {
            query += ` AND ii.program_id IN (${req.user.accessible_programs.join(',')})`;
        }
        
        // Filter by specific program if requested
        if (req.query.program_id) {
            query += ` AND ii.program_id = ${parseInt(req.query.program_id)}`;
        }
        
        query += ` ORDER BY ii.item_name`;
        
        await executeQuery(req, res, query);
    } catch (error) {
        console.error('Error getting inventory items:', error);
        res.status(500).json({ error: 'Failed to get inventory items' });
    }
});

// POST create new inventory item (with program validation)
app.post('/api/inventory-items', authenticateUser, checkProgramAccess('Write'), async (req, res) => {
    req.body.program_id = req.programId;
    req.body.created_by = req.user.user_id;
    
    const params = [{ name: 'ItemJson', type: sql.NVarChar, value: JSON.stringify(req.body) }];
    await executeProcedure(res, 'usp_SaveInventoryItem', params);
});

// =============================================================================
// USER MANAGEMENT ENDPOINTS (ADMIN ONLY)
// =============================================================================

// GET all users (Admin only)
app.get('/api/users', authenticateUser, async (req, res) => {
    if (!req.user.is_system_admin) {
        return res.status(403).json({ error: 'System Admin access required' });
    }
    
    try {
        const query = `
            SELECT u.user_id, u.user_name, u.display_name, u.email, u.is_active, u.is_system_admin,
                   u.last_login, u.date_created,
                   (
                       SELECT pa.program_id, pa.access_level, p.program_name
                       FROM ProgramAccess pa 
                       JOIN Programs p ON pa.program_id = p.program_id
                       WHERE pa.user_id = u.user_id AND pa.is_active = 1
                       FOR JSON PATH
                   ) as program_access
            FROM Users u
            WHERE u.is_active = 1
            ORDER BY u.display_name
        `;
        
        await executeQuery(req, res, query);
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// =============================================================================
// NOTIFICATION ENDPOINTS
// =============================================================================

// GET user notifications
app.get('/api/notifications', authenticateUser, async (req, res) => {
    try {
        const query = `
            SELECT notification_id, category, title, message, priority, is_read, 
                   is_actionable, action_url, action_text, date_created
            FROM Notifications
            WHERE user_id = @user_id 
            AND (expires_at IS NULL OR expires_at > GETDATE())
            ORDER BY date_created DESC
        `;
        
        const params = [{ name: 'user_id', type: sql.Int, value: req.user.user_id }];
        
        const pool = req.app.locals.db;
        const request = pool.request();
        params.forEach(param => {
            request.input(param.name, param.type, param.value);
        });
        
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// PUT mark notification as read
app.put('/api/notifications/:id/read', authenticateUser, async (req, res) => {
    try {
        const pool = req.app.locals.db;
        const result = await pool.request()
            .input('notification_id', sql.Int, req.params.id)
            .input('user_id', sql.Int, req.user.user_id)
            .query(`
                UPDATE Notifications 
                SET is_read = 1, date_read = GETDATE()
                WHERE notification_id = @notification_id AND user_id = @user_id
            `);
            
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ error: 'Notification not found' });
        }
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Health check endpoints
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        system: 'H10CM Multi-Tenant API',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get('/api/health/db', async (req, res) => {
    try {
        const pool = app.locals.db;
        if (pool && pool.connected) {
            // Test database connection with a simple query
            await pool.request().query('SELECT 1 as test');
            res.status(200).json({
                database: 'connected',
                database_name: 'H10CM',
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
// LEGACY ENDPOINTS (FOR BACKWARD COMPATIBILITY - TO BE UPDATED)
// =============================================================================

// Note: The remaining endpoints below need to be updated to include multi-tenant
// program filtering. For now, they are preserved for backward compatibility
// but should be updated to use the new authentication middleware and program filtering.

// GET a single inventory item by ID
app.get('/api/inventory-items/:id', async (req, res) => {
    const params = [{ name: 'inventory_item_id', type: sql.Int, value: req.params.id }];
    await executeProcedure(res, 'usp_GetInventoryItemById', params);
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

// Start server
app.listen(PORT, () => {
    console.log(`H10CM Multi-Tenant API server running on port ${PORT}`);
    console.log(`Database: H10CM (Multi-Tenant Architecture)`);
    console.log(`Features: Program-level isolation, RBAC, Certificate Authentication`);
    console.log(`Health Check: http://localhost:${PORT}/api/health`);
});
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

// =============================================================================
// NOTIFICATIONS
// =============================================================================

// GET all notifications for the current user
app.get('/api/notifications', async (req, res) => {
    try {
        const { 
            isRead, 
            category, 
            type, 
            actionRequired, 
            limit = 50, 
            offset = 0 
        } = req.query;

        // TODO: Implement database storage for notifications
        // For now, return an example structure
        const notifications = [
            {
                id: 'notif_' + Date.now(),
                type: 'warning',
                category: 'inventory',
                title: 'Low Stock Alert',
                message: 'RK73Z1HTTC resistor is running low (5 pieces remaining)',
                timestamp: new Date(),
                isRead: false,
                isImportant: true,
                actionRequired: true,
                relatedEntityType: 'inventory',
                relatedEntityId: 123,
                actionUrl: '/inventory/123',
                actionLabel: 'Reorder Now',
                icon: '📦'
            }
        ];

        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(notifications, null, 2));
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// POST create a new notification
app.post('/api/notifications', async (req, res) => {
    try {
        const {
            type,
            category, 
            title,
            message,
            isImportant = false,
            actionRequired = false,
            relatedEntityType,
            relatedEntityId,
            actionUrl,
            actionLabel,
            metadata = {},
            expiresAt,
            userId
        } = req.body;

        // TODO: Implement database storage
        const notification = {
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            type,
            category,
            title,
            message,
            timestamp: new Date(),
            isRead: false,
            isImportant,
            actionRequired,
            relatedEntityType,
            relatedEntityId,
            actionUrl,
            actionLabel,
            metadata,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            userId: userId || 'system'
        };

        console.log(`📧 Notification Created: [${category}] ${title}`);
        
        res.setHeader('Content-Type', 'application/json');
        res.status(201).send(JSON.stringify(notification, null, 2));
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ error: 'Failed to create notification' });
    }
});

// PATCH mark notification as read
app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
        const notificationId = req.params.id;
        
        // TODO: Update in database
        console.log(`📖 Notification marked as read: ${notificationId}`);
        
        res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// PATCH mark all notifications as read
app.patch('/api/notifications/mark-all-read', async (req, res) => {
    try {
        // TODO: Update all in database for user
        console.log('📖 All notifications marked as read');
        
        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// DELETE a notification
app.delete('/api/notifications/:id', async (req, res) => {
    try {
        const notificationId = req.params.id;
        
        // TODO: Delete from database
        console.log(`🗑️ Notification deleted: ${notificationId}`);
        
        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

// GET notification summary/stats
app.get('/api/notifications/summary', async (req, res) => {
    try {
        // TODO: Calculate from database
        const summary = {
            total: 15,
            unread: 5,
            critical: 2,
            actionRequired: 3,
            byCategory: {
                inventory: 8,
                orders: 4,
                production: 2,
                quality: 0,
                system: 1,
                user: 0,
                deadlines: 0,
                approvals: 0
            },
            byType: {
                success: 3,
                warning: 7,
                error: 2,
                info: 2,
                critical: 1,
                reminder: 0
            }
        };

        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify(summary, null, 2));
    } catch (error) {
        console.error('Error fetching notification summary:', error);
        res.status(500).json({ error: 'Failed to fetch notification summary' });
    }
});


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