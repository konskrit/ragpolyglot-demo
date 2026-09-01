DELETE FROM system_logs_archive
WHERE archived_at < NOW() - make_interval(days => $1)
