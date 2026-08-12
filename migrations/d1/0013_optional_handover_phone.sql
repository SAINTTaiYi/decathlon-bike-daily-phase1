-- Store optional handover phone numbers with the same encrypted-at-rest policy as repair contacts.
-- Both columns stay nullable so existing handovers and intentionally blank phone numbers remain valid.

ALTER TABLE handover_details ADD COLUMN contact_ciphertext TEXT;
ALTER TABLE handover_details ADD COLUMN contact_fingerprint TEXT;
