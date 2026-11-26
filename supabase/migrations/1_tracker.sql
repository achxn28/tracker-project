CREATE SCHEMA tracker;
REVOKE ALL ON SCHEMA tracker FROM PUBLIC;

CREATE TABLE tracker.opportunities (
  id text COLLATE "C" PRIMARY KEY,
  organization_name text NOT NULL CHECK (length(trim(organization_name)) > 0),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  type text NOT NULL CHECK (type IN ('Research', 'Startup', 'Formal Internship')),
  status text NOT NULL CHECK (status IN ('Saved', 'Researching', 'Ready for Outreach', 'Contacted / Applied', 'Responded', 'Meeting / Interview', 'Offer', 'Closed')),
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  work_arrangement text NOT NULL CHECK (work_arrangement IN ('onsite', 'hybrid', 'remote', 'unspecified')),
  contact_name text,
  contact_email text,
  website_url text,
  application_url text,
  location text,
  technical_focus text,
  fit_notes text,
  outreach_notes text,
  deadline date,
  next_action text,
  next_action_date date,
  notes text,
  closed_outcome text CHECK (closed_outcome IN ('rejected', 'withdrawn', 'no longer pursuing')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (closed_outcome IS NULL OR status = 'Closed')
);

CREATE TABLE tracker.activities (
  id text COLLATE "C" PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES tracker.opportunities(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'Initial email sent', 'Follow-up email sent', 'Reply received', 'Application submitted',
    'Meeting scheduled', 'Meeting completed', 'Interview completed', 'Offer received',
    'Rejection received', 'General note', 'Offer accepted'
  )),
  occurred_at timestamptz NOT NULL,
  notes text,
  positive_response smallint NOT NULL DEFAULT 0 CHECK (positive_response IN (0, 1)),
  created_at timestamptz NOT NULL
);

CREATE INDEX activities_opportunity_time ON tracker.activities(opportunity_id, occurred_at DESC);

CREATE TABLE tracker.tasks (
  id text COLLATE "C" PRIMARY KEY,
  opportunity_id text REFERENCES tracker.opportunities(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text,
  category text NOT NULL CHECK (category IN ('Research', 'Startup', 'Applications', 'Portfolio / Projects', 'Administration')),
  priority text NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
);

CREATE INDEX tasks_due_date ON tracker.tasks(due_date);
CREATE INDEX tasks_opportunity ON tracker.tasks(opportunity_id);

CREATE TABLE tracker.goals (
  id text COLLATE "C" PRIMARY KEY,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  metric_type text NOT NULL CHECK (metric_type IN (
    'research_contacts', 'startup_contacts', 'formal_applications', 'positive_responses',
    'meetings_completed', 'offers_received', 'offers_accepted', 'tasks_completed'
  )),
  target_count bigint NOT NULL CHECK (target_count BETWEEN 1 AND 9007199254740991),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (start_date <= end_date)
);

CREATE TABLE tracker.preferences (
  id integer PRIMARY KEY CHECK (id = 1),
  follow_up_days integer NOT NULL CHECK (follow_up_days BETWEEN 1 AND 365)
);

REVOKE ALL ON ALL TABLES IN SCHEMA tracker FROM PUBLIC;
