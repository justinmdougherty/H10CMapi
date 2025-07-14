// h10cm_api.js - H10CM Multi-Tenant API Server

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
    database: "H10CM",  // Multi-tenant database
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

const DEFAULT_USER_CERT = "MIIFRDCCBCygAwIBAgIDBnVHMA0GCSqGSIb3DQEBCwUAMFoxCzAJBgNVBAYTAlVTMRgwFgYDVQQKEw9VLlMuIEdvdmVybm1lbnQxDDAKBgNVBAsTA0RvRDEMMAoGA1UECxMDUEtJMRUwEwYDVQQDEwxET0QgSUQgQ0EtNzMwHhcNMjQwNzA5MDAwMDAwWhcNMjcwNzA4MjM1OTU5WjB/MQswCQYDVQQGEwJVUzEYMBYGA1UEChMPVS5TLiBHb3Zlcm5tZW50MQwwCgYDVQQLEwNEb0QxDDAKBgNVBAsTA1BLSTEMMAoGA1UECxMDVVNOMSwwKgYDVQQDEyNET1VHSEVSVFkuSlVTVElOLk1JQ0hBRUwuMTI1MDIyNzIyODCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJ98y7xGmNrfVUtSA85i9EzyFfzpWLZvQfWv3KMvE9tdvjYLpi9wf1Mm440NZSdsn+VBSruZyb7s7EWa9Jiw19A4AsHHTm0PDUmIt5WbGPcXsszc/6eL/VEsR2V/gp5mhl96Az5ct/fMIslFhh5UX+H7ma8K56Hwir1vIc/Be80fQBulMwzGHz0vWOyQ0AWDtLWf6VdpYJV+Vjv0SC+H3pgIbEZL91Vwwmd1i8PzHi5BojfQIhI64IQuKqyPcZrLgmA3trNpHPJP8hdw4fe8I+N6TAjH/NkaB2BICis5pIbnmlrUyac60jr9qtavfBNfjtHTC9NQtQSv7+oQzMvqL5kCAwEAAaOCAewwggHoMB8GA1UdIwQYMBaAFOkhe/IUbzhViHqgUAmekXIcS9k7MDcGA1UdHwQwMC4wLKAqoCiGJmh0dHA6Ly9jcmwuZGlzYS5taWwvY3JsL0RPRElEQ0FfNzMuY3JsMA4GA1UdDwEB/wQEAwIHgDAkBgNVHSAEHTAbMAsGCWCGSAFlAgELKjAMBgpghkgBZQMCAQMNMB0GA1UdDgQWBBTjksZ1APK0JkryT88aMZw9hGjSvDBlBggrBgEFBQcBAQRZMFcwMwYIKwYBBQUHMAKGJ2h0dHA6Ly9jcmwuZGlzYS5taWwvc2lnbi9ET0RJRENBXzczLmNlcjAgBggrBgEFBQcwAYYUaHR0cDovL29jc3AuZGlzYS5taWwwgYgGA1UdEQSBgDB+oCcGCGCGSAFlAwYGoBsEGdT4ENs8CGwUVIGtg2DaCKhQjiEChDgQo/OgJAYKKwYBBAGCNxQCA6AWDBQxMjUwMjI3MjI4MTE3MDAyQG1pbIYtdXJuOnV1aWQ6QTQ4NkZFRTctNDE4NS00NTAyLUEzOTQtRDVERUNDRUJBNkUzMBsGA1UdCQQUMBIwEAYIKwYBBQUHCQQxBBMCVVMwKAYDVR0lBCEwHwYKKwYBBAGCNxQCAgYIKwYBBQUHAwIGBysGAQUCAwQwDQYJKoZIhvcNAQELBQADggEBAFc6ZODAlHhmEInPE9vnPpGOYBaFhQ06RDDxft3UDKn9oxB0gxogFAs/5kMIJE+wn9mjazLH/B2VnizUfXarFZcPCP3aziNeVAWH/ZjqMq8PxUvV1PJdVxVJu1cU6XberkTs5dgHNSlAb39Qdl/OQANERHa1pUdCgHscIeGl2TrvprzXD3zf0WsFI57hNeil6KUazf3u3pXuN2P00cv3ryEOw7CzC2IO0Q61Yn/vAjCprVh3IhoIkF0yPrYhUiP5qqTLyhynDynnDYwbnt/ZGQYaLiC+gNFxZwkQJtGHVXlb7WOW0zRZI3QaBSielwK1eawfdq/J2SCtT3YHriwKeaI=";

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

// Legacy stored procedure execution (for backward compatibility)
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
    res.send('H10CM Multi-Tenant API is running!');
});

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

// GET users with their program access (Admin only)
app.get('/api/users', authenticateUser, async (req, res) => {
    if (!req.user.is_system_admin) {
        return res.status(403).json({ error: 'System Admin access required' });
    }
    
    try {
        const query = `
            SELECT u.user_id, u.user_name, u.display_name, u.email, u.is_active, u.is_system_admin,
                   u.last_login, u.date_created,
                   JSON_QUERY((
                       SELECT pa.program_id, pa.access_level, p.program_name
                       FROM ProgramAccess pa 
                       JOIN Programs p ON pa.program_id = p.program_id
                       WHERE pa.user_id = u.user_id AND pa.is_active = 1
                       FOR JSON PATH
                   )) as program_access
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

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

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

// Start server
app.listen(PORT, () => {
    console.log(`H10CM Multi-Tenant API server running on port ${PORT}`);
    console.log(`Database: H10CM (Multi-Tenant Architecture)`);
    console.log(`Features: Program-level isolation, RBAC, Certificate Authentication`);
    console.log(`Health Check: http://localhost:${PORT}/api/health`);
    console.log(`Auth Test: http://localhost:${PORT}/api/auth/me`);
    console.log(`Programs: http://localhost:${PORT}/api/programs`);
});
