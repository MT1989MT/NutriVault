-- Ensure display names are unique across all activation codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_display_name_unique ON activation_codes(display_name);
