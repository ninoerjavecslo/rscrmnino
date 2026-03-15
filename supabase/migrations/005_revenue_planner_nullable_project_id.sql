-- Allow revenue_planner rows without a project_id (for maintenance costs, hosting, domains)
ALTER TABLE revenue_planner ALTER COLUMN project_id DROP NOT NULL;
