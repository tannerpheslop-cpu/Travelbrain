-- Add a foreign key from companions.user_id to public.users so PostgREST
-- can resolve the user:users(...) join in queries.
-- public.users.id already mirrors auth.users.id, so this is safe.

alter table companions
  add constraint companions_user_id_fk
  foreign key (user_id) references public.users(id) on delete cascade;
