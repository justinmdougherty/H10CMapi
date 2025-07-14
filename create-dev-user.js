// Create development user for testing request access functionality
const sql = require('mssql');

const config = {
    user: 'sa',
    password: '0)Password',
    server: '127.0.0.1',
    database: 'H10CM',
    port: 1433,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};

async function createDevUser() {
    try {
        await sql.connect(config);
        console.log('Connected to database...');
        
        // First, ensure the base site admin program exists
        console.log('Checking for base site admin program...');
        const existingProgram = await sql.query(`
            SELECT * FROM Programs WHERE program_id = 1
        `);
        
        if (existingProgram.recordset.length === 0) {
            console.log('Creating base site admin program...');
            await sql.query(`
                SET IDENTITY_INSERT Programs ON;
                INSERT INTO Programs (program_id, program_name, program_code, program_description, is_active, date_created, program_manager)
                VALUES (1, 'Site Administration', 'SITE-ADMIN', 'Master program for site administration and system management', 1, GETDATE(), 'System Administrator');
                SET IDENTITY_INSERT Programs OFF;
            `);
            console.log('Base site admin program created with ID 1');
        } else {
            console.log('Base site admin program already exists');
        }
        // Check if development user exists
        const existingUser = await sql.query(`
            SELECT * FROM Users 
            WHERE certificate_subject = 'CN=development-user,OU=Development,OU=Test,O=Development,C=US'
        `);
        
        if (existingUser.recordset.length > 0) {
            console.log('Development user already exists, updating...');
            
            // Update existing user to visitor role
            await sql.query(`
                UPDATE Users 
                SET is_system_admin = 0, 
                    user_name = 'dev-visitor',
                    display_name = 'Development Visitor (Limited Access)'
                WHERE certificate_subject = 'CN=development-user,OU=Development,OU=Test,O=Development,C=US'
            `);
            
        } else {
            console.log('Creating new development visitor user...');
            
            // Create visitor-level development user
            await sql.query(`
                INSERT INTO Users (user_name, display_name, certificate_subject, is_system_admin, is_active, date_created)
                VALUES ('dev-visitor', 'Development Visitor (Limited Access)', 
                        'CN=development-user,OU=Development,OU=Test,O=Development,C=US', 0, 1, GETDATE())
            `);
        }
        
        // Remove any existing program access for this user
        await sql.query(`
            DELETE FROM ProgramAccess 
            WHERE user_id IN (
                SELECT user_id FROM Users 
                WHERE certificate_subject = 'CN=development-user,OU=Development,OU=Test,O=Development,C=US'
            )
        `);
        
        // Give very limited access to the site admin program to trigger request access flow
        console.log('Setting up limited program access to site admin program...');
        await sql.query(`
            INSERT INTO ProgramAccess (user_id, program_id, access_level, granted_by, date_granted, is_active)
            VALUES (
                (SELECT user_id FROM Users WHERE certificate_subject = 'CN=development-user,OU=Development,OU=Test,O=Development,C=US'),
                1, 
                'Read', 
                (SELECT TOP 1 user_id FROM Users WHERE is_system_admin = 1), 
                GETDATE(), 
                1
            )
        `);
        
        // Show the created user
        const newUser = await sql.query(`
            SELECT u.user_id, u.user_name, u.display_name, u.is_system_admin, u.is_active,
                   pa.access_level, p.program_name
            FROM Users u
            LEFT JOIN ProgramAccess pa ON u.user_id = pa.user_id AND pa.is_active = 1
            LEFT JOIN Programs p ON pa.program_id = p.program_id
            WHERE u.certificate_subject = 'CN=development-user,OU=Development,OU=Test,O=Development,C=US'
        `);
        
        console.log('\n=== Development User Created ===');
        console.table(newUser.recordset);
        console.log('\nThis user has limited "Read" access and should trigger request access dialogs.');
        console.log('Comment out your default certificate to test with this user.');
        
        await sql.close();
        
    } catch (err) {
        console.error('Error creating development user:', err.message);
        console.error('Full error:', err);
    }
}

createDevUser();
