ALTER TABLE metric_observations
  ADD COLUMN source_key char(64);

CREATE UNIQUE INDEX metric_observations_source_key_key
  ON metric_observations (source_key)
  WHERE source_key IS NOT NULL;
