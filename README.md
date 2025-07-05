# API for Production Management App

This directory contains the Node.js, Express, and MSSQL backend for the Production Management & Inventory Tracking App.

## Getting Started

### Prerequisites

- Node.js (v18.x or later recommended)
- npm
- Access to an MSSQL Server instance

### Installation

1.  **Navigate to the API directory:**
    ```bash
    cd api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

### Configuration

1.  **Environment Variables:** Create a `.env` file in the `api` directory by copying the `.env.example` file.

    ```bash
    cp .env.example .env
    ```

2.  **Update `.env`:** Modify the `.env` file with your database credentials and other environment-specific settings:
    - `PORT`: The port the server will run on (e.g., 3000).
    - `DB_USER`: Your MSSQL username.
    - `DB_PASSWORD`: Your MSSQL password.
    - `DB_SERVER`: The address of your MSSQL server.
    - `DB_DATABASE`: The name of the database to use.

### Running the Server

-   **Development Mode:** To run the server with automatic restarts on file changes (using `nodemon`):
    ```bash
    npm run dev
    ```

-   **Production Mode:** To build and run the compiled JavaScript:
    ```bash
    npm run build
    npm start
    ```

The API will be available at `http://localhost:PORT` (e.g., `http://localhost:3000`).

## API Endpoints

Below is a summary of the available API endpoints. 

### Projects

-   `GET /api/projects`: Get all projects.
-   `GET /api/projects/:id`: Get a single project by its ID.
-   `POST /api/projects`: Create a new project.
-   `PUT /api/projects/:id`: Update an existing project.
-   `GET /api/projects/:id/steps`: Get all steps for a specific project.
-   `GET /api/projects/:id/tracked-items`: Get all tracked items for a specific project.

### Inventory

-   `GET /api/inventory-items`: Get all inventory items.
-   `POST /api/inventory-items`: Create a new inventory item.
-   `PUT /api/inventory-items/:id`: Update an inventory item.
-   `DELETE /api/inventory-items/:id`: Delete an inventory item.

### Tracked Items

-   `POST /api/tracked-items`: Create a new tracked item (unit).
-   `POST /api/tracked-items/:id/attributes`: Save attributes for a tracked item.
-   `PUT /api/tracked-items/:itemId/steps/:stepId`: Update the progress of a specific step for a tracked item.

## Database

-   **Technology:** Microsoft SQL Server (MSSQL).
-   **Schema:** The database schema is managed via migration scripts located in the `src/db/migrations` directory (this is a placeholder; adjust if your structure is different).

### Schema To-Do

-   [ ] **Inventory-Project-Step Association:** Update the database schema to link inventory items to specific projects and individual production steps. This will likely involve:
    -   Adding a `project_id` foreign key to the `InventoryItems` table OR creating a join table (`ProjectInventory`).
    -   Creating a `StepInventoryRequirements` table to define which inventory items (and in what quantity) are required for each `ProjectStep`.

