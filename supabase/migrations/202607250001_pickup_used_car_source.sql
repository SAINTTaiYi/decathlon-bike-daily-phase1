-- Add the durable used-car Pending Pickup source without allowing wildcard source values.
ALTER TABLE bike_ops.pickup_details
  DROP CONSTRAINT IF EXISTS pickup_details_pickup_source_check;

ALTER TABLE bike_ops.pickup_details
  ADD CONSTRAINT pickup_details_pickup_source_check
  CHECK (pickup_source IN ('self-pickup', 'repair', 'customer-storage', 'used-car'));
