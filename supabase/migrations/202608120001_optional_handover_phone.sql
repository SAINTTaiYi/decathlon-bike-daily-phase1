-- Keep the optional handover contact encrypted at rest; existing rows remain valid.
alter table bike_ops.handover_details
  add column if not exists contact_ciphertext text,
  add column if not exists contact_fingerprint varchar(64);
