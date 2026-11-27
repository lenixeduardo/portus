BEGIN;
ALTER TABLE capture_sessions
  ADD COLUMN wavelength_equipment_id bigint REFERENCES equipments(id),
  ADD COLUMN wavelength_nm double precision,
  ADD CONSTRAINT capture_session_wavelength_valid CHECK (
    (wavelength_equipment_id IS NULL) = (wavelength_nm IS NULL)
    AND wavelength_nm BETWEEN 0 AND 1500
  );
COMMIT;
