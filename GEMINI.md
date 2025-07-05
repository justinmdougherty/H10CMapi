'''# Gemini Project Configuration: TF_CMapp (Full Stack)

This document provides a complete context for the TF_CMapp project, including the React frontend, the Express.js API, and the MSSQL database.

## 1. Frontend Tech Stack

- **Framework:** React
- **Language:** TypeScript
- **Build Tool:** Vite
- **UI Library:** Material UI (`@mui/material`, `@mui/icons-material`, etc.)
- **State Management:** Zustand
- **Data Fetching:** React Query (`@tanstack/react-query`), Axios
- **Routing:** React Router (`react-router-dom`)

---

## 2. Backend Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** Microsoft SQL Server
- **Database Driver:** `mssql`
- **CORS:** `cors`

---

## 3. API Endpoints & Frontend Data Flow

The API provides data through a series of RESTful endpoints. The frontend will use React Query and Axios to interact with these endpoints.

### Projects (`/api/projects`)

- **`GET /api/projects`**
  - **Returns**: A JSON array of all projects. Each project object contains `project_id`, `name`, `description`, and `created_date`.
  - **Frontend Display**: This data should be fetched on the `ProjectsDashboardPage.tsx` and displayed in a list or grid. Each item should be a link that navigates to the `ProjectDetailsPage` for that `project_id`.

- **`GET /api/projects/{id}`**
  - **Returns**: A single project object by its ID.
  - **Frontend Display**: Used on the `ProjectDetailsPage.tsx` to fetch and display the name and description of the selected project.

- **`POST /api/projects`** & **`PUT /api/projects/{id}`**
  - **Functionality**: Creates or updates a project.
  - **Frontend Display**: These endpoints will be used in a form/modal on the dashboard to allow users to create new projects or edit existing ones.

### Tracked Items (`/api/projects/{projectId}/tracked-items`)

- **`GET /api/projects/{projectId}/tracked-items`**
  - **Returns**: A JSON array of all "tracked items" (e.g., individual units being built) for a given project.
  - **Frontend Display**: This is the core data for the **`BatchTrackingComponent.tsx`**. It should be fetched when the `ProjectDetailsPage` loads and displayed in a table. The table should show key details for each item and allow clicking to see full details.

- **`GET /api/tracked-items/{id}`**
  - **Returns**: A detailed object for a single tracked item, including its progress on various steps.
  - **Frontend Display**: Used when a user clicks on a specific tracked item in the `BatchTrackingComponent`. This will likely open a modal or a new page showing the status of each step for that item.

- **`POST /api/tracked-items/{itemId}/steps/{stepId}`**
  - **Functionality**: Updates the progress of a specific manufacturing/assembly step for a single item. The request body includes fields like `status`, `progress_percentage`, and `notes`.
  - **Frontend Display**: The UI for a tracked item's details should allow users (e.g., technicians) to update the status of each step, triggering this API call.

### Inventory (`/api/inventory-items`)

- **`GET /api/inventory-items`**
  - **Returns**: A JSON array of all inventory items, including `name`, `description`, `unit_of_measure`, and `current_stock`.
  - **Frontend Display**: This will populate an "Inventory Management" page or a dashboard widget. It should display a searchable/filterable table of all materials.

- **`POST /api/inventory-items/adjust`**
  - **Functionality**: Adjusts the stock level of an inventory item.
  - **Frontend Display**: The inventory management UI should have controls (e.g., buttons and a modal form) to allow authorized users to manually adjust stock counts.

---

## 4. Project Status

### Finished ✔️

* **Backend API**: A comprehensive and well-structured Express.js API has been created and documented.
- **Database Schema**: A robust MSSQL database schema has been designed and implemented to support all project requirements, including projects, inventory, tracked items, and steps.
- **API Functionality**: Endpoints for creating, reading, updating, and deleting all major data entities are functional.
- **API Documentation**: A clear, interactive Swagger UI documentation page (`api.html`) has been created, outlining all endpoints and data structures.
- **Refactoring**: The API has been refactored to use stored procedures for all database interactions, centralizing business logic and improving security.
- **Debugging**: A configurable debugging system has been implemented. Set the `API_DEBUG` environment variable to `true` to enable detailed request/response logging.

### To-Do 📝

* **Frontend Data Fetching**: Implement React Query hooks (`useProjects`, `useTrackedItems`, etc.) to connect the frontend components to the backend API endpoints.
- **`ProjectsDashboardPage.tsx`**: Connect the component to the `GET /api/projects` endpoint and render the list of projects. Implement the "Create Project" functionality.
- **`ProjectDetailsPage.tsx`**: Fetch data from `GET /api/projects/{id}` to display project details. Pass the `projectId` to the `BatchTrackingComponent`.
- **`BatchTrackingComponent.tsx`**: This is the next major task.
  - Fetch and display data from `GET /api/projects/{projectId}/tracked-items`.
  - Create the UI to show the detailed view of a single tracked item (`GET /api/tracked-items/{id}`).
  - Implement the form/controls to update step progress using `POST /api/tracked-items/{itemId}/steps/{stepId}`.
- **Inventory Management UI**: Build a new set of components to display and manage inventory using the `/api/inventory-items` endpoints.
- **State Management**: Integrate Zustand for handling global UI state, such as notifications (e.g., "Project Saved Successfully!") and user session data.
'''
