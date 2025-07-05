-- Sample data for testing the BatchTrackingComponent
USE TFPM;
GO -- First, let's insert some projects if they don't exist
    IF NOT EXISTS (
        SELECT 1
        FROM Projects
        WHERE project_name = 'PR'
    ) BEGIN
INSERT INTO Projects (project_name, project_description, status)
VALUES ('PR', 'Production Radio units', 'Active');
END
GO IF NOT EXISTS (
        SELECT 1
        FROM Projects
        WHERE project_name = 'Assembly Line A'
    ) BEGIN
INSERT INTO Projects (project_name, project_description, status)
VALUES (
        'Assembly Line A',
        'General assembly production line',
        'Active'
    );
END
GO -- Get the project IDs for reference
DECLARE @PRProjectId INT = (
        SELECT project_id
        FROM Projects
        WHERE project_name = 'PR'
    );
DECLARE @AssemblyProjectId INT = (
        SELECT project_id
        FROM Projects
        WHERE project_name = 'Assembly Line A'
    );
-- Insert AttributeDefinitions for PR project
IF NOT EXISTS (
    SELECT 1
    FROM AttributeDefinitions
    WHERE project_id = @PRProjectId
        AND attribute_name = 'Unit Serial Number'
) BEGIN
INSERT INTO AttributeDefinitions (
        project_id,
        attribute_name,
        attribute_type,
        display_order,
        is_required
    )
VALUES (@PRProjectId, 'Unit Serial Number', 'TEXT', 1, 1);
END IF NOT EXISTS (
    SELECT 1
    FROM AttributeDefinitions
    WHERE project_id = @PRProjectId
        AND attribute_name = 'PCB Serial Number'
) BEGIN
INSERT INTO AttributeDefinitions (
        project_id,
        attribute_name,
        attribute_type,
        display_order,
        is_required
    )
VALUES (@PRProjectId, 'PCB Serial Number', 'TEXT', 2, 0);
END -- Insert AttributeDefinitions for Assembly project
IF NOT EXISTS (
    SELECT 1
    FROM AttributeDefinitions
    WHERE project_id = @AssemblyProjectId
        AND attribute_name = 'Unit Serial Number'
) BEGIN
INSERT INTO AttributeDefinitions (
        project_id,
        attribute_name,
        attribute_type,
        display_order,
        is_required
    )
VALUES (
        @AssemblyProjectId,
        'Unit Serial Number',
        'TEXT',
        1,
        1
    );
END -- Insert some project steps for PR
IF NOT EXISTS (
    SELECT 1
    FROM ProjectSteps
    WHERE project_id = @PRProjectId
) BEGIN
INSERT INTO ProjectSteps (
        project_id,
        step_code,
        step_name,
        step_description,
        step_order
    )
VALUES (
        @PRProjectId,
        'pr_step_01',
        'PCB Assembly',
        'Assemble the PCB components',
        1
    ),
    (
        @PRProjectId,
        'pr_step_02',
        'Firmware Upload',
        'Upload firmware to the device',
        2
    ),
    (
        @PRProjectId,
        'pr_step_03',
        'Testing',
        'Perform functional testing',
        3
    ),
    (
        @PRProjectId,
        'pr_step_04',
        'Quality Check',
        'Final quality inspection',
        4
    ),
    (
        @PRProjectId,
        'pr_step_05',
        'Packaging',
        'Package the unit for shipping',
        5
    );
END -- Insert some project steps for Assembly
IF NOT EXISTS (
    SELECT 1
    FROM ProjectSteps
    WHERE project_id = @AssemblyProjectId
) BEGIN
INSERT INTO ProjectSteps (
        project_id,
        step_code,
        step_name,
        step_description,
        step_order
    )
VALUES (
        @AssemblyProjectId,
        'assy_step_01',
        'Component Assembly',
        'Assemble main components',
        1
    ),
    (
        @AssemblyProjectId,
        'assy_step_02',
        'Calibration',
        'Calibrate the assembled unit',
        2
    ),
    (
        @AssemblyProjectId,
        'assy_step_03',
        'Testing',
        'Test the assembled unit',
        3
    );
END -- Insert some tracked items for PR project
INSERT INTO TrackedItems (project_id, current_overall_status, is_shipped)
VALUES (@PRProjectId, 'In Progress', 0),
    (@PRProjectId, 'Completed', 0);
-- Get the item IDs for the tracked items we just created
DECLARE @PRItem1Id INT = (
        SELECT TOP 1 item_id
        FROM TrackedItems
        WHERE project_id = @PRProjectId
        ORDER BY item_id
    );
DECLARE @PRItem2Id INT = (
        SELECT item_id
        FROM TrackedItems
        WHERE project_id = @PRProjectId
            AND item_id > @PRItem1Id
    );
-- Get attribute definition IDs
DECLARE @UnitSNAttrId INT = (
        SELECT attribute_definition_id
        FROM AttributeDefinitions
        WHERE project_id = @PRProjectId
            AND attribute_name = 'Unit Serial Number'
    );
DECLARE @PCBSNAttrId INT = (
        SELECT attribute_definition_id
        FROM AttributeDefinitions
        WHERE project_id = @PRProjectId
            AND attribute_name = 'PCB Serial Number'
    );
-- Insert attribute values for the tracked items
INSERT INTO ItemAttributeValues (
        item_id,
        attribute_definition_id,
        attribute_value
    )
VALUES (@PRItem1Id, @UnitSNAttrId, 'PR-001'),
    (@PRItem1Id, @PCBSNAttrId, 'PCB-001'),
    (@PRItem2Id, @UnitSNAttrId, 'PR-002'),
    (@PRItem2Id, @PCBSNAttrId, 'PCB-002');
-- Get step IDs for PR project
DECLARE @Step1Id INT = (
        SELECT step_id
        FROM ProjectSteps
        WHERE project_id = @PRProjectId
            AND step_order = 1
    );
DECLARE @Step2Id INT = (
        SELECT step_id
        FROM ProjectSteps
        WHERE project_id = @PRProjectId
            AND step_order = 2
    );
DECLARE @Step3Id INT = (
        SELECT step_id
        FROM ProjectSteps
        WHERE project_id = @PRProjectId
            AND step_order = 3
    );
DECLARE @Step4Id INT = (
        SELECT step_id
        FROM ProjectSteps
        WHERE project_id = @PRProjectId
            AND step_order = 4
    );
DECLARE @Step5Id INT = (
        SELECT step_id
        FROM ProjectSteps
        WHERE project_id = @PRProjectId
            AND step_order = 5
    );
-- Insert step progress for item 1 (partially completed)
INSERT INTO TrackedItemStepProgress (
        item_id,
        step_id,
        status,
        completion_timestamp,
        completed_by_user_name
    )
VALUES (
        @PRItem1Id,
        @Step1Id,
        'Complete',
        DATEADD(day, -2, GETDATE()),
        'John Doe'
    ),
    (
        @PRItem1Id,
        @Step2Id,
        'Complete',
        DATEADD(day, -1, GETDATE()),
        'Jane Smith'
    ),
    (@PRItem1Id, @Step3Id, 'In Progress', NULL, NULL),
    (@PRItem1Id, @Step4Id, 'Not Started', NULL, NULL),
    (@PRItem1Id, @Step5Id, 'Not Started', NULL, NULL);
-- Insert step progress for item 2 (fully completed)
INSERT INTO TrackedItemStepProgress (
        item_id,
        step_id,
        status,
        completion_timestamp,
        completed_by_user_name
    )
VALUES (
        @PRItem2Id,
        @Step1Id,
        'Complete',
        DATEADD(day, -5, GETDATE()),
        'John Doe'
    ),
    (
        @PRItem2Id,
        @Step2Id,
        'Complete',
        DATEADD(day, -4, GETDATE()),
        'Jane Smith'
    ),
    (
        @PRItem2Id,
        @Step3Id,
        'Complete',
        DATEADD(day, -3, GETDATE()),
        'Bob Johnson'
    ),
    (
        @PRItem2Id,
        @Step4Id,
        'Complete',
        DATEADD(day, -2, GETDATE()),
        'Alice Wilson'
    ),
    (
        @PRItem2Id,
        @Step5Id,
        'Complete',
        DATEADD(day, -1, GETDATE()),
        'Charlie Brown'
    );
-- Update the second item to show it's fully completed
UPDATE TrackedItems
SET current_overall_status = 'Completed',
    date_fully_completed = DATEADD(day, -1, GETDATE())
WHERE item_id = @PRItem2Id;
PRINT 'Sample data inserted successfully!';