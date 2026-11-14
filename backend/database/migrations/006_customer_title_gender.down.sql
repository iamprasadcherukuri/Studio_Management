DO $$ BEGIN RAISE EXCEPTION 'Rollback refused: preserve customer profile fields and configured masters; use a reviewed forward correction or verified backup restore'; END;$$;
