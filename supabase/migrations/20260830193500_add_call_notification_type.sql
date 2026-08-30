-- One user-facing notification type for an incoming call.
alter type public.notification_type add value if not exists 'call';
