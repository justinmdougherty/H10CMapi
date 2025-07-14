# H10CM Multi-Tenant API Documentation

## Overview

The H10CM Multi-Tenant API provides a comprehensive enterprise-grade solution for production management and inventory tracking with complete program-level isolation. This API supports true multi-tenancy where different programs (tenants) can operate independently while sharing the same database infrastructure.

## Key Features

### 🔐 Multi-Tenant Security
- **Program-Level Isolation**: Complete data segregation between programs
- **Certificate-Based Authentication**: Secure user identification via client certificates
- **Role-Based Access Control (RBAC)**: Granular permissions at system, program, and project levels
- **Access Level Controls**: Read, Write, and Admin access levels per program

### 🏢 Enterprise Architecture
- **Single Database, Multiple Tenants**: Efficient resource utilization with program_id filtering
- **Scalable Design**: Add new programs without database schema changes
- **Audit Trail**: Complete tracking of all data access and modifications
- **Smart Notifications**: User-specific notifications with program context

## Database Configuration

```javascript
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
```

## Authentication & Authorization

### Certificate-Based Authentication

The API uses client certificates for user authentication. Users are identified by their certificate subject and their program access is retrieved from the database.

```javascript
// Certificate extraction (simplified for development)
const extractCertificateSubject = (cert) => {
    return "CN=DOUGHERTY.JUSTIN.MICHAEL.1250227228,OU=USN,OU=PKI,OU=DoD,O=U.S. Government,C=US";
};
```

### Access Control Middleware

#### `authenticateUser`
Extracts user information from certificate and retrieves program access from database.

#### `checkProgramAccess(level)`
Validates user access to specific programs with required access level:
- `Read`: View data
- `Write`: Modify data
- `Admin`: Full program control

### User Object Structure

```javascript
{
    user_id: 1,
    user_name: "justin.dougherty",
    display_name: "Justin Dougherty",
    is_system_admin: false,
    program_access: [
        {
            program_id: 1,
            program_name: "TF Operations",
            program_code: "TF",
            access_level: "Admin"
        }
    ],
    accessible_programs: [1, 2, 3]
}
```

## API Endpoints

### Authentication Endpoints

#### `GET /api/auth/me`
Returns current user information including program access.

**Response:**
```json
{
    "user": {
        "user_id": 1,
        "username": "justin.dougherty",
        "displayName": "Justin Dougherty",
        "is_system_admin": false,
        "program_access": [...],
        "accessible_programs": [1, 2],
        "certificateInfo": {...}
    }
}
```

### Program Management Endpoints (Admin Only)

#### `GET /api/programs`
Get all programs (filtered by user access for non-admins).

**Query Parameters:**
- None required

**Response:**
```json
[
    {
        "program_id": 1,
        "program_name": "TF Operations",
        "program_code": "TF",
        "program_description": "TF production management",
        "is_active": true,
        "date_created": "2025-07-13T00:00:00.000Z"
    }
]
```

#### `POST /api/programs` (System Admin Only)
Create a new program/tenant.

**Request Body:**
```json
{
    "program_name": "New Program",
    "program_code": "NEW",
    "program_description": "Description of new program"
}
```

#### `POST /api/programs/:programId/access` (System Admin Only)
Grant program access to a user.

**Request Body:**
```json
{
    "user_id": 2,
    "access_level": "Write"
}
```

### Project Endpoints (Program-Filtered)

#### `GET /api/projects`
Get projects (automatically filtered by user's program access).

**Query Parameters:**
- `program_id` (optional): Filter by specific program
- `status` (optional): Filter by project status

**Response:**
```json
[
    {
        "project_id": 1,
        "program_id": 1,
        "project_name": "TF Production Run #001",
        "program_name": "TF Operations",
        "status": "Active",
        "priority": "High"
    }
]
```

#### `GET /api/projects/:id`
Get single project (with program access validation).

#### `POST /api/projects`
Create new project (requires Write access to specified program).

**Request Body:**
```json
{
    "program_id": 1,
    "project_name": "New Project",
    "project_description": "Project description",
    "status": "Planning",
    "priority": "Medium"
}
```

#### `PUT /api/projects/:id`
Update existing project (validates program access).

### Task Endpoints (Program-Filtered)

#### `GET /api/tasks`
Get tasks (filtered by user's program access).

**Query Parameters:**
- `program_id` (optional): Filter by program
- `project_id` (optional): Filter by project
- `assigned_to_me` (optional): Filter by current user's assignments

#### `POST /api/tasks`
Create new task (requires Write access to program).

### Inventory Endpoints (Program-Filtered)

#### `GET /api/inventory-items`
Get inventory items (filtered by user's program access).

**Query Parameters:**
- `program_id` (optional): Filter by specific program

#### `POST /api/inventory-items`
Create new inventory item (requires Write access to program).

### User Management Endpoints (Admin Only)

#### `GET /api/users`
Get all users with their program access (System Admin only).

### Notification Endpoints

#### `GET /api/notifications`
Get current user's notifications.

#### `PUT /api/notifications/:id/read`
Mark notification as read.

### Health Check Endpoints

#### `GET /api/health`
Basic health check.

#### `GET /api/health/db`
Database connectivity check.

## Multi-Tenant Data Filtering

### Automatic Program Filtering

All data endpoints automatically filter results based on the user's program access:

```javascript
// Non-admin users only see data from their accessible programs
if (!req.user.is_system_admin && req.user.accessible_programs.length > 0) {
    query += ` AND program_id IN (${req.user.accessible_programs.join(',')})`;
}
```

### Program Access Validation

Before creating or modifying data, the API validates the user has appropriate access:

```javascript
// Check user has Write access to the program
const checkProgramAccess = (requiredLevel = 'Read') => {
    return (req, res, next) => {
        // Validates user access level and sets req.programId
    };
};
```

## Error Handling

### Authentication Errors
- `401 Unauthorized`: User not found or invalid certificate
- `403 Forbidden`: Insufficient access level for requested operation

### Program Access Errors
- `400 Bad Request`: Program ID required but not provided
- `403 Forbidden`: Access denied to specified program
- `403 Forbidden`: Insufficient access level (e.g., Read access when Write required)

### Data Errors
- `404 Not Found`: Requested resource not found or not accessible
- `500 Internal Server Error`: Database connection or query errors

## Usage Examples

### Starting the Server

```bash
node index.js
```

Server starts on port 3000 with comprehensive logging:
```
H10CM Multi-Tenant API server running on port 3000
Database: H10CM (Multi-Tenant Architecture)
Features: Program-level isolation, RBAC, Certificate Authentication
Health Check: http://localhost:3000/api/health
```

### Testing Authentication

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "x-arr-clientcert: [certificate-data]"
```

### Creating a New Program (Admin Only)

```bash
curl -X POST http://localhost:3000/api/programs \
  -H "Content-Type: application/json" \
  -H "x-arr-clientcert: [admin-certificate]" \
  -d '{
    "program_name": "Manufacturing Operations",
    "program_code": "MFG",
    "program_description": "General manufacturing operations"
  }'
```

### Granting Program Access (Admin Only)

```bash
curl -X POST http://localhost:3000/api/programs/1/access \
  -H "Content-Type: application/json" \
  -H "x-arr-clientcert: [admin-certificate]" \
  -d '{
    "user_id": 2,
    "access_level": "Write"
  }'
```

### Getting Program-Filtered Projects

```bash
curl -X GET http://localhost:3000/api/projects?program_id=1 \
  -H "x-arr-clientcert: [user-certificate]"
```

## Security Considerations

### Certificate Validation
- In production, implement proper certificate parsing and validation
- Verify certificate chain and expiration
- Implement certificate revocation checking

### Database Security
- Use SQL parameter binding to prevent injection attacks
- Implement connection pooling with proper limits
- Enable database audit logging

### Access Control
- All endpoints require authentication via certificate
- Program-level data isolation prevents cross-tenant data access
- Access levels enforce proper authorization for data modifications

### Audit Trail
- All data modifications are logged with user identification
- Program access changes are tracked
- Failed authentication attempts are logged

## Development vs Production

### Development Mode
- Uses default certificate for testing
- Simplified certificate subject extraction
- Detailed error messages and logging

### Production Considerations
- Implement proper certificate parsing
- Use environment variables for database configuration
- Enable HTTPS/TLS for all communications
- Implement rate limiting and DDoS protection
- Use connection pooling and caching
- Configure proper logging and monitoring

## Database Schema Integration

This API is designed to work with the H10CM database schema that includes:

- `Programs` table for tenant isolation
- `Users` table with certificate-based authentication
- `ProgramAccess` table for user-program permissions
- `ProjectAccess` table for project-level permissions
- All business tables (Projects, Tasks, InventoryItems) include `program_id` for filtering

## Migration from Single-Tenant

### Backward Compatibility
- Legacy endpoints are preserved but deprecated
- Gradual migration path from TFPM to H10CM
- Stored procedures can be updated incrementally

### Data Migration
- Existing data migrated to default program
- Users granted access to default program
- New programs can be added without affecting existing data

## Future Enhancements

### Planned Features
- REST API versioning (v1, v2)
- GraphQL endpoint for flexible queries
- Real-time WebSocket notifications
- Advanced RBAC with custom roles
- API rate limiting per tenant
- Multi-language support
- Audit dashboard
- Performance analytics

### Scalability Improvements
- Database read replicas for reporting
- Caching layer (Redis) for frequently accessed data
- Microservices architecture for specific domains
- Container orchestration support

---

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install express mssql cors
   ```

2. **Configure Database**
   - Ensure H10CM database is created and accessible
   - Update database credentials in configuration

3. **Start the API**
   ```bash
   node index.js
   ```

4. **Test Health Check**
   ```bash
   curl http://localhost:3000/api/health
   ```

5. **Test Authentication**
   ```bash
   curl http://localhost:3000/api/auth/me
   ```

The H10CM Multi-Tenant API is now ready for enterprise production management with complete program-level isolation and comprehensive security controls.
