-- New findings wait as 'pending' until the Fact Checker has reviewed them.
alter table ad_learnings add column if not exists review_status text not null default 'pending' check (review_status in ('pending','checked'));
update ad_learnings set review_status = 'checked' where created_at < now();
