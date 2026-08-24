REVOKE EXECUTE ON FUNCTION public.refresh_product_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_product_favorites() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_on_review() FROM PUBLIC, anon, authenticated;