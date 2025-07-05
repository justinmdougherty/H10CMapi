'''-- Create the database if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'TFPM')
BEGIN
    CREATE DATABASE TFPM;
END
GO

-- Use the TFPM database for subsequent commands
USE TFPM;
GO

-- Create Projects Table
-- Stores information about each distinct product line or project type.
CREATE TABLE Projects (
    project_id INT IDENTITY(1,1) PRIMARY KEY,
    project_name NVARCHAR(100) NOT NULL UNIQUE, -- Unique name for the product line (e.g., "PR", "TT")
    project_description NVARCHAR(MAX) NULL,    -- General description of the product line
    status NVARCHAR(50) NULL, -- e.g., 'Active', 'Development', 'Discontinued', 'On Hold'
    date_created DATETIME2 NOT NULL DEFAULT GETDATE(),
    last_modified DATETIME2 NOT NULL DEFAULT GETDATE()
);
GO

-- Create InventoryItems Table
-- Master catalog of all parts, materials, or components.
CREATE TABLE InventoryItems (
    inventory_item_id INT IDENTITY(1,1) PRIMARY KEY,
    item_name NVARCHAR(255) NOT NULL,
    part_number NVARCHAR(100) NULL UNIQUE,
    description NVARCHAR(MAX) NULL,
    unit_of_measure NVARCHAR(50) NOT NULL,
    current_stock_level DECIMAL(18, 4) NOT NULL DEFAULT 0.0000,
    reorder_point DECIMAL(18, 4) NULL,
    supplier_info NVARCHAR(MAX) NULL,
    cost_per_unit DECIMAL(18, 2) NULL
);
GO

-- Create AttributeDefinitions Table
-- Defines the custom fields/attributes ("table headers") for items within a specific project (product line).
CREATE TABLE AttributeDefinitions (
    attribute_definition_id INT IDENTITY(1,1) PRIMARY KEY,
    project_id INT NOT NULL,
    attribute_name NVARCHAR(255) NOT NULL, -- e.g., "Unit Serial Number", "PCB Serial Number", "Firmware Version"
    attribute_type NVARCHAR(50) NOT NULL, -- e.g., 'TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'LIST'
    display_order INT NOT NULL DEFAULT 0,
    is_required BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_AttributeDefinitions_Projects FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT UQ_ProjectAttributeName UNIQUE (project_id, attribute_name) -- Ensures attribute names are unique within a project
);
GO

-- Create ProjectSteps Table
-- Defines the sequence of production or assembly steps for a specific project (product line).
CREATE TABLE ProjectSteps (
    step_id INT IDENTITY(1,1) PRIMARY KEY,
    project_id INT NOT NULL,
    step_code NVARCHAR(100) NULL, -- Optional code for frontend mapping (e.g., 'pr_step_01')
    step_name NVARCHAR(255) NOT NULL,
    step_description NVARCHAR(MAX) NULL,
    step_order INT NOT NULL DEFAULT 0,
    CONSTRAINT FK_ProjectSteps_Projects FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT UQ_ProjectStepOrder UNIQUE (project_id, step_order), -- Ensures step order is unique within a project
    CONSTRAINT UQ_ProjectStepCodeAllowNull UNIQUE (project_id, step_code) -- Ensures step code is unique within a project if used (handle NULLs appropriately if DB doesn't by default)
);
GO
-- Note for UQ_ProjectStepCode: SQL Server treats NULLs as distinct in unique constraints by default.
-- If you need step_code to be unique OR NULL, this is fine. If multiple NULLs are not allowed per project_id,
-- you might need a filtered unique index or an indexed view depending on exact SQL Server version and requirements.
-- For simplicity, UQ_ProjectStepCode assumes NULLs are allowed and distinct.

-- Create TrackedItems Table
-- Represents the individual units being produced or managed for a specific project (product line).
CREATE TABLE TrackedItems (
    item_id INT IDENTITY(1,1) PRIMARY KEY,
    project_id INT NOT NULL, -- Links the unit to a specific project (product line)
    -- unique_identifier NVARCHAR(255) NULL, -- Removed as business identifiers (like SN) will be attributes. Item_id is the system unique ID.
    current_overall_status NVARCHAR(50) NULL DEFAULT 'Pending', -- e.g., 'Pending', 'In Progress', 'Completed', 'Shipped'
    is_shipped BIT NOT NULL DEFAULT 0,
    shipped_date DATETIME2 NULL,
    date_fully_completed DATETIME2 NULL, -- When all steps for this unit are marked complete
    date_created DATETIME2 NOT NULL DEFAULT GETDATE(),
    last_modified DATETIME2 NOT NULL DEFAULT GETDATE(),
    notes NVARCHAR(MAX) NULL, -- General notes for the tracked item
    CONSTRAINT FK_TrackedItems_Projects FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE ON UPDATE CASCADE
);
GO

-- Create StepInventoryRequirements Table
-- Links production steps of a specific project to the inventory items they require.
CREATE TABLE StepInventoryRequirements (
    requirement_id INT IDENTITY(1,1) PRIMARY KEY,
    step_id INT NOT NULL, -- FK to ProjectSteps
    inventory_item_id INT NOT NULL, -- FK to InventoryItems
    quantity_required DECIMAL(18, 4) NOT NULL,
    CONSTRAINT FK_StepInventoryRequirements_ProjectSteps FOREIGN KEY (step_id) REFERENCES ProjectSteps(step_id) ON DELETE CASCADE ON UPDATE CASCADE, -- If a step is deleted, its requirements are deleted.
    CONSTRAINT FK_StepInventoryRequirements_InventoryItems FOREIGN KEY (inventory_item_id) REFERENCES InventoryItems(inventory_item_id) ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT UQ_StepInventoryItem UNIQUE (step_id, inventory_item_id)
);
GO

-- Create ItemAttributeValues Table
-- Stores the actual values for the custom attributes of each tracked item.
CREATE TABLE ItemAttributeValues (
    value_id INT IDENTITY(1,1) PRIMARY KEY,
    item_id INT NOT NULL, -- FK to TrackedItems
    attribute_definition_id INT NOT NULL, -- FK to AttributeDefinitions
    attribute_value NVARCHAR(MAX) NULL, -- Value is stored as text; application handles type conversion based on AttributeDefinitions.attribute_type
    CONSTRAINT FK_ItemAttributeValues_TrackedItems FOREIGN KEY (item_id) REFERENCES TrackedItems(item_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FK_ItemAttributeValues_AttributeDefinitions FOREIGN KEY (attribute_definition_id) REFERENCES AttributeDefinitions(attribute_definition_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT UQ_ItemAttributeDefinition UNIQUE (item_id, attribute_definition_id) -- Ensures one value per attribute per item
);
GO

-- Create TrackedItemStepProgress Table
-- Tracks the completion status of each production step for each tracked item.
CREATE TABLE TrackedItemStepProgress (
    item_step_progress_id INT IDENTITY(1,1) PRIMARY KEY,
    item_id INT NOT NULL, -- FK to TrackedItems
    step_id INT NOT NULL, -- FK to ProjectSteps
    status NVARCHAR(50) NOT NULL DEFAULT 'Not Started', -- e.g., 'Not Started', 'In Progress', 'Complete', 'N/A', 'Skipped', 'Failed'
    start_timestamp DATETIME2 NULL,
    completion_timestamp DATETIME2 NULL,
    completed_by_user_name NVARCHAR(255) NULL, -- Changed from user_id
    notes NVARCHAR(MAX) NULL,
    CONSTRAINT FK_TrackedItemStepProgress_TrackedItems FOREIGN KEY (item_id) REFERENCES TrackedItems(item_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT FK_TrackedItemStepProgress_ProjectSteps FOREIGN KEY (step_id) REFERENCES ProjectSteps(step_id) ON DELETE NO ACTION ON UPDATE NO ACTION, -- Avoids multiple cascade paths
    CONSTRAINT UQ_TrackedItemStep UNIQUE (item_id, step_id)
);
GO

-- Create InventoryTransactions Table
-- Audit log for all changes to inventory stock levels.
CREATE TABLE InventoryTransactions (
    transaction_id INT IDENTITY(1,1) PRIMARY KEY,
    inventory_item_id INT NOT NULL,
    tracked_item_id INT NULL, -- Optional: links consumption to a specific produced unit
    step_id INT NULL, -- Optional: links consumption to the step that triggered it
    transaction_type NVARCHAR(50) NOT NULL,
    quantity_changed DECIMAL(18, 4) NOT NULL,
    transaction_timestamp DATETIME2 NOT NULL DEFAULT GETDATE(),
    user_name NVARCHAR(255) NULL, -- Changed from user_id
    notes NVARCHAR(MAX) NULL,
    CONSTRAINT FK_InventoryTransactions_InventoryItems FOREIGN KEY (inventory_item_id) REFERENCES InventoryItems(inventory_item_id) ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT FK_InventoryTransactions_TrackedItems FOREIGN KEY (tracked_item_id) REFERENCES TrackedItems(item_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT FK_InventoryTransactions_ProjectSteps FOREIGN KEY (step_id) REFERENCES ProjectSteps(step_id) ON DELETE NO ACTION ON UPDATE NO ACTION -- Avoids multiple cascade paths
);
GO

-- Add Last Modified Triggers
CREATE TRIGGER TRG_Projects_LastModified
ON Projects
AFTER UPDATE
AS
BEGIN
    IF UPDATE(last_modified) RETURN; -- Avoid recursive trigger calls if last_modified is directly updated
    UPDATE Projects
    SET last_modified = GETDATE()
    FROM Projects
    INNER JOIN inserted ON Projects.project_id = inserted.project_id;
END;
GO

CREATE TRIGGER TRG_TrackedItems_LastModified
ON TrackedItems
AFTER UPDATE
AS
BEGIN
    IF UPDATE(last_modified) RETURN; -- Avoid recursive trigger calls
    UPDATE TrackedItems
    SET last_modified = GETDATE()
    FROM TrackedItems
    INNER JOIN inserted ON TrackedItems.item_id = inserted.item_id;
END;
GO

-- Basic Indexing
CREATE INDEX IDX_Projects_project_name ON Projects(project_name);
GO
CREATE INDEX IDX_AttributeDefinitions_project_id ON AttributeDefinitions(project_id);
GO
CREATE INDEX IDX_ProjectSteps_project_id ON ProjectSteps(project_id);
GO
CREATE INDEX IDX_TrackedItems_project_id ON TrackedItems(project_id);
GO
CREATE INDEX IDX_StepInventoryRequirements_step_id ON StepInventoryRequirements(step_id);
GO
CREATE INDEX IDX_StepInventoryRequirements_inventory_item_id ON StepInventoryRequirements(inventory_item_id);
GO
CREATE INDEX IDX_ItemAttributeValues_item_id ON ItemAttributeValues(item_id);
GO
CREATE INDEX IDX_ItemAttributeValues_attribute_definition_id ON ItemAttributeValues(attribute_definition_id);
GO
CREATE INDEX IDX_TrackedItemStepProgress_item_id ON TrackedItemStepProgress(item_id);
GO
CREATE INDEX IDX_TrackedItemStepProgress_step_id ON TrackedItemStepProgress(step_id);
GO
CREATE INDEX IDX_InventoryTransactions_inventory_item_id ON InventoryTransactions(inventory_item_id);
GO
CREATE INDEX IDX_InventoryTransactions_tracked_item_id ON InventoryTransactions(tracked_item_id);
GO
CREATE INDEX IDX_InventoryTransactions_step_id ON InventoryTransactions(step_id);
GO
CREATE INDEX IDX_InventoryTransactions_transaction_timestamp ON InventoryTransactions(transaction_timestamp);
GO

-- Stored Procedure: usp_GetProjectDetails
-- Returns a comprehensive JSON object for a single project.
CREATE OR ALTER PROCEDURE usp_GetProjectDetails
    @project_id INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Check if the project exists
    IF NOT EXISTS (SELECT 1 FROM Projects WHERE project_id = @project_id)
    BEGIN
        -- Return NULL (which will become an empty JSON array in the API) to indicate not found
        SELECT NULL AS ProjectDetailsJson;
        RETURN;
    END

    -- Select the project details and format as a single JSON object
    SELECT (
        SELECT
            project_id,
            project_name,
            project_description,
            status,
            date_created,
            last_modified
        FROM Projects
        WHERE project_id = @project_id
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    ) AS ProjectDetailsJson;
END;
GO
'''

