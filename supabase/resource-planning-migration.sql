-- Resource Planning tables
-- Run once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS team_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  display_order int  NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_plan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid REFERENCES team_members(id) ON DELETE SET NULL,  -- NULL = Dev Team
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  period      date NOT NULL,   -- Monday for weeks, 1st for months
  period_type text NOT NULL CHECK (period_type IN ('week', 'month')),
  hours       numeric NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_plan_period_idx ON resource_plan(period, period_type);
CREATE INDEX IF NOT EXISTS resource_plan_member_idx ON resource_plan(member_id);

-- Tracks which projects are pinned to the resource planning view
CREATE TABLE IF NOT EXISTS resource_projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(project_id)
);
