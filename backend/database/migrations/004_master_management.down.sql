-- Conservative rollback: never discard configured masters or custom transactional choices.
DO $$ BEGIN RAISE EXCEPTION 'Automatic master rollback is disabled to preserve configured masters. Restore a verified pre-004 backup into a separate database and review reconciliation before switching.'; END; $$;
