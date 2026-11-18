-- PREPARED ONLY. Run as postgres in Supabase SQL Editor after inviting the user.
-- This enrolls only the first account explicitly approved by the project owner.
-- It does not create an Auth user, send mail, or grant public sign-up.
begin;
do $enroll$
declare approved_id uuid;
begin
  select id into strict approved_id from auth.users
    where lower(email) = 'chris@gsimport.co.th';
  insert into wine_private.team_access(user_id,can_write)
    values (approved_id,true)
    on conflict (user_id) do update set can_write=excluded.can_write;
exception
  when no_data_found then
    raise exception 'Invite chris@gsimport.co.th in Authentication > Users first, then rerun this file.';
end;
$enroll$;
select u.email,a.can_write,a.approved_at from wine_private.team_access a
  join auth.users u on u.id=a.user_id where lower(u.email)='chris@gsimport.co.th';
commit;
