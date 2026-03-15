-- Allow multiple revenue_planner rows per maintenance per month (e.g. invoice + cost)
DROP INDEX IF EXISTS revenue_planner_maintenance_month;
