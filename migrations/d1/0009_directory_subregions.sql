-- Four-level directory: major region -> subregion -> city -> store.
-- Forward-only and data-preserving: existing region/city/store ids remain stable.
CREATE TABLE subregions (
  id TEXT PRIMARY KEY NOT NULL,
  region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (region_id, normalized_name)
);
INSERT INTO subregions (id, region_id, name, normalized_name, status, sort_order, created_at, updated_at)
SELECT '40000000-0000-4000-8000-' || printf('%012d', ROW_NUMBER() OVER (ORDER BY id)), id,
       CASE WHEN name = '南区' THEN '广西江湖区' ELSE name || '小区' END,
       CASE WHEN name = '南区' THEN '广西江湖区' ELSE name || '小区' END,
       status, 0, created_at, updated_at
FROM regions;
ALTER TABLE cities ADD COLUMN subregion_id TEXT REFERENCES subregions(id);
UPDATE cities SET subregion_id = (SELECT sr.id FROM subregions sr WHERE sr.region_id = cities.region_id ORDER BY sr.sort_order, sr.id LIMIT 1) WHERE subregion_id IS NULL;
CREATE INDEX subregions_region_active_idx ON subregions(region_id, status, sort_order, name);
CREATE INDEX cities_subregion_active_idx ON cities(subregion_id, status, sort_order, name);
