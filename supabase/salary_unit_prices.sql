-- Add unit price columns to salaries table
-- basic_per_day: daily rate (basic_salary / 26), admin inputs this directly
-- media_actor_per_video: per-video rate for actor work
-- Note: media_per_video and kythuat_per_job already exist

ALTER TABLE salaries ADD COLUMN IF NOT EXISTS basic_per_day NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_actor_per_video NUMERIC DEFAULT 0;

-- Backfill basic_per_day from existing basic_salary data
UPDATE salaries SET basic_per_day = ROUND(basic_salary / 26)
WHERE basic_per_day = 0 AND basic_salary > 0;

-- Backfill media_actor_per_video from existing data (total / count)
UPDATE salaries SET media_actor_per_video = ROUND(media_actor_total / media_actor_count)
WHERE media_actor_per_video = 0 AND media_actor_count > 0 AND media_actor_total > 0;

-- Backfill media_per_video from existing data (total / count)
UPDATE salaries SET media_per_video = ROUND(media_total / media_videos)
WHERE media_per_video = 0 AND media_videos > 0 AND media_total > 0;

-- Backfill kythuat_per_job from existing data (total / count)
UPDATE salaries SET kythuat_per_job = ROUND(kythuat_total / kythuat_jobs)
WHERE kythuat_per_job = 0 AND kythuat_jobs > 0 AND kythuat_total > 0;
