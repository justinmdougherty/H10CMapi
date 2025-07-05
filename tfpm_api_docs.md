# TFPM API Documentation

## Overview

The TFPM (Task Flow Project Management) API is a RESTful service built with Node.js and Express that manages projects, inventory, tracked items, and their associated workflows. The API connects to a SQL Server database and uses stored procedures for data operations.

**Base URL:** `http://localhost:3000` (or your deployed server URL)

**Content-Type:** `application/json`

## Authentication

Currently, no authentication is required for API endpoints.

## Error Handling

The API returns standard HTTP status codes:
- `200` - Success
- `204` - No Content (successful operation with no data returned)
- `400` - Bad Request (validation errors from stored procedures)
- `500` - Internal Server Error

Error responses follow this format:
```json
{
  "error": {
    "ErrorMessage": "Description of the error",
    "details": "Additional error details"
  }
}
```

---

## Projects

### Get All Projects
```http
GET /api/projects
```

**Response:**
```json
[
  {
    "project_id": 1,
    "name": "Sample Project",
    "description": "Project description"
  }
]
```

### Get Project by ID
```http
GET /api/projects/{id}
```

**Parameters:**
- `id` (path, integer) - Project ID

### Create Project
```http
POST /api/projects
```

**Request Body:**
```json
{
  "name": "New Project",
  "description": "Project description"
}
```

### Update Project
```http
PUT /api/projects/{id}
```

**Parameters:**
- `id` (path, integer) - Project ID

**Request Body:**
```json
{
  "name": "Updated Project",
  "description": "Updated description"
}
```

---

## Inventory Items

### Get All Inventory Items
```http
GET /api/inventory-items
```

### Get Inventory Item by ID
```http
GET /api/inventory-items/{id}
```

**Parameters:**
- `id` (path, integer) - Inventory item ID

### Create Inventory Item
```http
POST /api/inventory-items
```

**Request Body:**
```json
{
  "name": "Item Name",
  "description": "Item description",
  "unit_of_measure": "pcs",
  "current_stock": 100
}
```

### Update Inventory Item
```http
PUT /api/inventory-items/{id}
```

**Parameters:**
- `id` (path, integer) - Inventory item ID

### Adjust Inventory Stock
```http
POST /api/inventory-items/adjust
```

**Request Body:**
```json
{
  "inventory_item_id": 1,
  "adjustment_quantity": 50,
  "adjustment_type": "increase",
  "reason": "Stock replenishment"
}
```

### Get Inventory Transactions
```http
GET /api/inventory-items/{id}/transactions
```

**Parameters:**
- `id` (path, integer) - Inventory item ID

---

## Attribute Definitions

### Get Attributes for Project
```http
GET /api/projects/{projectId}/attributes
```

**Parameters:**
- `projectId` (path, integer) - Project ID

### Create Attribute Definition
```http
POST /api/attributes
```

**Request Body:**
```json
{
  "project_id": 1,
  "attribute_name": "Color",
  "attribute_type": "text",
  "is_required": true,
  "default_value": "Blue"
}
```

### Update Attribute Definition
```http
PUT /api/attributes/{id}
```

**Parameters:**
- `id` (path, integer) - Attribute definition ID

### Delete Attribute Definition
```http
DELETE /api/attributes/{id}
```

**Parameters:**
- `id` (path, integer) - Attribute definition ID

---

## Project Steps

### Get Steps for Project
```http
GET /api/projects/{projectId}/steps
```

**Parameters:**
- `projectId` (path, integer) - Project ID

### Create Project Step
```http
POST /api/steps
```

**Request Body:**
```json
{
  "project_id": 1,
  "step_name": "Assembly",
  "step_description": "Assemble components",
  "step_order": 1,
  "estimated_duration_minutes": 30
}
```

### Update Project Step
```http
PUT /api/steps/{id}
```

**Parameters:**
- `id` (path, integer) - Step ID

### Delete Project Step
```http
DELETE /api/steps/{id}
```

**Parameters:**
- `id` (path, integer) - Step ID

---

## Step Inventory Requirements

### Get Inventory Requirements for Step
```http
GET /api/steps/{stepId}/inventory-requirements
```

**Parameters:**
- `stepId` (path, integer) - Step ID

### Create Inventory Requirement
```http
POST /api/inventory-requirements
```

**Request Body:**
```json
{
  "step_id": 1,
  "inventory_item_id": 5,
  "required_quantity": 2
}
```

### Delete Inventory Requirement
```http
DELETE /api/inventory-requirements/{id}
```

**Parameters:**
- `id` (path, integer) - Requirement ID

---

## Tracked Items

### Get Tracked Items for Project
```http
GET /api/projects/{projectId}/tracked-items
```

**Parameters:**
- `projectId` (path, integer) - Project ID

### Get Tracked Item Details
```http
GET /api/tracked-items/{id}
```

**Parameters:**
- `id` (path, integer) - Tracked item ID

### Create Tracked Item
```http
POST /api/tracked-items
```

**Request Body:**
```json
{
  "project_id": 1,
  "item_name": "Item #001",
  "description": "First tracked item"
}
```

### Update Tracked Item Details
```http
PUT /api/tracked-items/{id}
```

**Parameters:**
- `id` (path, integer) - Tracked item ID

**Request Body:**
```json
{
  "item_name": "Updated Item Name",
  "description": "Updated description"
}
```

### Save Attribute Values
```http
POST /api/tracked-items/{id}/attributes
```

**Parameters:**
- `id` (path, integer) - Tracked item ID

**Request Body:**
```json
{
  "attributes": [
    {
      "attribute_definition_id": 1,
      "value": "Red"
    },
    {
      "attribute_definition_id": 2,
      "value": "Large"
    }
  ]
}
```

### Update Step Progress
```http
POST /api/tracked-items/{itemId}/steps/{stepId}
```

**Parameters:**
- `itemId` (path, integer) - Tracked item ID
- `stepId` (path, integer) - Step ID

**Request Body:**
```json
{
  "status": "completed",
  "progress_percentage": 100,
  "notes": "Step completed successfully",
  "actual_duration_minutes": 25
}
```

---

## View Endpoints (Read-Only)

### Inventory Stock Status
```http
GET /api/views/inventory-stock-status
```

Returns current stock levels and status for all inventory items.

### Tracked Items Overview
```http
GET /api/views/tracked-items-overview
```

Returns an overview of all tracked items with their current status.

### Step Progress Status
```http
GET /api/views/step-progress-status
```

Returns progress status for all tracked item steps.

---

## Setup Instructions

### Prerequisites
- Node.js and npm installed
- SQL Server database with TFPM schema
- Required stored procedures and views in database

### Installation
1. Create project folder and save code as `server.js`
2. Run `npm init -y` in the project folder
3. Install dependencies: `npm install express mssql cors`
4. Update database configuration in `dbConfig` object
5. Start server: `node server.js`

### Database Configuration
Update the following values in the `dbConfig` object:
```javascript
const dbConfig = {
    user: "your_username",
    password: "your_password", 
    server: "your_server_address",
    database: "TFPM",
    port: 1433
};
```

### Environment Variables
The server uses `process.env.PORT` for deployment or defaults to port 3000 for local development.

---

## Technical Notes

- All data operations use SQL Server stored procedures
- JSON data is passed to stored procedures as string parameters
- Database connection pool is maintained in `app.locals.db`
- CORS is enabled for all routes
- Request bodies are parsed as JSON automatically