# H10CM Multi-Tenant API

**Enterprise-grade multi-tenant API server providing secure, program-isolated business operations management.**

## Overview

The H10CM API is a Node.js/Express server that provides multi-tenant business management capabilities with complete data isolation between programs (tenants). Built with enterprise security, role-based access control, and certificate-based authentication.

## Key Features

### Multi-Tenant Architecture
- **Program-Level Isolation**: Every API endpoint filters data by user's accessible programs
- **Secure Authentication**: Certificate-based user identification with fallback for development
- **Role-Based Access Control**: Granular permissions at system, program, and project levels
- **Data Integrity**: Complete isolation prevents cross-tenant data access

### API Endpoints

#### Authentication & User Management
```
GET  /api/auth/me              - Get current user info and accessible programs
GET  /api/users                - List users (Admin only, conditional for setup)
POST /api/admin/create-user    - Create new user (Admin only, conditional for setup)
```

#### Program Management
```
GET  /api/programs             - List accessible programs (conditional auth for setup)
POST /api/programs             - Create new program (Admin only, conditional for setup)
POST /api/programs/:id/access  - Grant program access to user (Admin only)
```

#### Business Operations (Program-Filtered)
```
GET  /api/projects             - List projects (filtered by user's program access)
POST /api/projects             - Create project (requires Write access)
PUT  /api/projects/:id         - Update project (requires Write access)

GET  /api/tasks                - List tasks (filtered by user's program access)
POST /api/tasks                - Create task (requires Write access)

GET  /api/inventory-items      - List inventory (filtered by user's program access)
POST /api/inventory-items      - Create inventory item (requires Write access)

GET  /api/notifications        - List user notifications
PUT  /api/notifications/:id/read - Mark notification as read
```

#### Health & Monitoring
```
GET  /api/health               - API health status
GET  /api/health/db            - Database connection status
```

### Authentication Middleware

The API uses certificate-based authentication with automatic fallback:

1. **Production**: Validates DoD PKI certificates from headers
2. **Development**: Uses default certificate for local development
3. **Conditional Setup**: Allows unauthenticated access for initial system setup

### Access Control Middleware

Every business operation endpoint includes:
- **User Authentication**: Validates user identity and loads program access
- **Program Filtering**: Automatically filters data by user's accessible programs
- **Permission Validation**: Checks required access level (Read/Write/Admin)
- **Data Isolation**: Prevents cross-program data access

### Database Integration

- **MSSQL Connection**: Robust connection handling with health monitoring
- **Stored Procedures**: Integration with existing H10CM stored procedures
- **Transaction Management**: Proper error handling and rollback support
- **Multi-Tenant Schema**: Program-based data isolation at database level

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start
# API available at http://localhost:3000

# Health check
curl http://localhost:3000/api/health
```

## Configuration

### Database Configuration
```javascript
const dbConfig = {
    user: "sa",
    password: "0)Password", 
    server: "127.0.0.1",
    database: "H10CM",
    port: 1433,
    options: {
        encrypt: true,
        enableArithAbort: true,
        trustServerCertificate: true
    }
};
```

### Environment Variables
- `PORT`: API server port (default: 3000)
- Certificate headers are automatically handled by the authentication middleware

## Security Features

### Certificate-Based Authentication
- Validates DoD PKI certificates for user identification
- Extracts user information from certificate subjects
- Fallback authentication for development environments

### Multi-Tenant Security
- Complete data isolation between programs
- Automatic program-based filtering on all endpoints
- Access level validation (Read/Write/Admin)
- Audit trail support for all operations

### API Security
- Input validation on all endpoints
- SQL injection prevention through parameterized queries
- Cross-origin resource sharing (CORS) configuration
- Proper error handling without information leakage

## Development

### Adding New Endpoints

1. **Add Route**: Define new endpoint in appropriate section
2. **Apply Middleware**: Use `authenticateUser` and `checkProgramAccess` as needed
3. **Program Filtering**: Ensure data is filtered by user's program access
4. **Error Handling**: Implement proper error responses

### Testing

```bash
# Run API tests
npm test

# Test authentication
curl -H "x-arr-clientcert: [certificate]" http://localhost:3000/api/auth/me

# Test program access
curl http://localhost:3000/api/programs
```

## Production Deployment

### Required Setup
1. **Database**: H10CM database with proper schema and stored procedures
2. **Certificates**: PKI certificate validation configuration
3. **Security**: Proper certificate header configuration in production environment
4. **Monitoring**: Health check endpoints for load balancer integration

### System Admin Setup
For initial deployment:
1. Create first program using `/api/programs` (no auth required for first program)
2. Create system admin user using `/api/admin/create-user` (no auth required for first admin)
3. All subsequent operations require proper authentication and authorization

## Architecture

The API follows a layered architecture:
- **Routes**: RESTful endpoint definitions
- **Middleware**: Authentication, authorization, and request processing
- **Business Logic**: Program-aware business operations
- **Data Layer**: Multi-tenant database operations with proper isolation

This ensures complete separation of concerns while maintaining enterprise-grade security and multi-tenant capabilities.
