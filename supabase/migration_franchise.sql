-- Franchise / multi-restaurant groups
CREATE TABLE IF NOT EXISTS franchise_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  logo_emoji text DEFAULT '🏢',
  plan text DEFAULT 'group',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES franchise_groups(id);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS region text DEFAULT '';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS manager_email text DEFAULT '';

CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id uuid REFERENCES franchise_groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'manager',
  regions text[],
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id uuid REFERENCES franchise_groups(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  subject text NOT NULL,
  html_body text NOT NULL,
  segment text DEFAULT 'all',
  target text DEFAULT 'all',
  restaurant_ids uuid[],
  status text DEFAULT 'draft',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE franchise_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages franchise_groups" ON franchise_groups FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Members can read their group" ON franchise_groups FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = id AND m.user_id = auth.uid())
);
CREATE POLICY "Owner manages group_members" ON group_members FOR ALL USING (
  EXISTS (SELECT 1 FROM franchise_groups g WHERE g.id = group_id AND g.owner_id = auth.uid())
);
CREATE POLICY "Members can read group_members" ON group_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = group_members.group_id AND m.user_id = auth.uid())
);
CREATE POLICY "Owner manages group_campaigns" ON group_campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM franchise_groups g WHERE g.id = group_id AND g.owner_id = auth.uid())
);
