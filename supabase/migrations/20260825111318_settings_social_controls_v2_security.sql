revoke execute on function public.get_unavailable_user_ids() from anon;
revoke execute on function public.get_unavailable_user_ids() from public;
grant execute on function public.get_unavailable_user_ids() to authenticated;
