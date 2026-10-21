-- Platform admin flag, audit actor, membership backfill, and tenant read policies.
-- is_member reads memberships as the table owner. As an invoker it would see
-- no rows: memberships has row security and no policy for certa_app.

CREATE OR REPLACE FUNCTION is_member(p uuid, roles text[] DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.project_id = p
      AND m.user_id::text = coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        current_setting('app.current_user_id', true)
      )
      AND m.status = 'active'
      AND (roles IS NULL OR m.role = ANY (roles))
  );
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'user';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE users ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('user', 'platform_admin'));

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_kind text NOT NULL DEFAULT 'user';
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_kind_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_kind_check
  CHECK (actor_kind IN ('user', 'agent', 'system', 'admin'));

INSERT INTO memberships (project_id, user_id, role)
SELECT project_id, user_id, CASE role WHEN 'main_contractor' THEN 'contractor' ELSE role END
FROM parties
WHERE role IN ('client', 'consultant', 'main_contractor', 'contractor', 'subcontractor', 'viewer')
ON CONFLICT (project_id, user_id, role) DO NOTHING;

-- 0003 let every member, including a subcontractor, read every stage.
DROP POLICY IF EXISTS stages_member_select ON stages;
CREATE POLICY stages_member_select ON stages FOR SELECT TO certa_app
  USING (
    is_member(project_id, ARRAY['client', 'consultant', 'contractor', 'viewer'])
    OR (
      is_member(project_id, ARRAY['subcontractor'])
      AND EXISTS (
        SELECT 1 FROM parties p
        WHERE p.id = stages.assigned_party_id
          AND p.user_id::text = coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            current_setting('app.current_user_id', true)
          )
      )
    )
  );

DROP POLICY IF EXISTS projects_member_select ON projects;
CREATE POLICY projects_member_select ON projects FOR SELECT TO certa_app
  USING (is_member(id));

DROP POLICY IF EXISTS documents_member_select ON documents;
CREATE POLICY documents_member_select ON documents FOR SELECT TO certa_app
  USING (is_member(project_id, ARRAY['client', 'consultant', 'contractor', 'viewer']));
