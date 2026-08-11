-- Flat store self-registration: remove the region -> subregion -> city directory.
-- Stores remain the stable business boundary; work items, memberships, audit
-- events and attachments already reference stores directly.
-- The pending_review column (0008) stays for the platform-admin store review flow;
-- self_registration_pending marks stores created by the public OTP flow before the
-- first account completes registration.
DROP INDEX IF EXISTS stores_city_active_idx;
ALTER TABLE stores DROP COLUMN city_id;
DROP TABLE cities;
DROP TABLE subregions;
DROP TABLE regions;
ALTER TABLE stores ADD COLUMN self_registration_pending INTEGER NOT NULL DEFAULT 0 CHECK (self_registration_pending IN (0, 1));
