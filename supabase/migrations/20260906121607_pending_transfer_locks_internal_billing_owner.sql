create or replace function public.block_entitlement_billing_owner_when_ownership_transfer_pending()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.owner_transfer', true) = 'on' then
    return new;
  end if;

  if exists (
    select 1
    from public.workspace_ownership_transfers transfer
    where transfer.workspace_id = new.workspace_id
      and transfer.status = 'pending'
  ) then
    raise exception 'pending ownership transfer must be resolved before billing owner changes'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.workspace_entitlements') is not null then
    drop trigger if exists block_entitlement_billing_owner_when_ownership_transfer_pending_trigger
    on public.workspace_entitlements;

    create trigger block_entitlement_billing_owner_when_ownership_transfer_pending_trigger
    before update of billing_owner_user_id, provider_customer_id, provider_subscription_id, payment_method_required_at
    on public.workspace_entitlements
    for each row execute function public.block_entitlement_billing_owner_when_ownership_transfer_pending();
  end if;
end $$;

revoke all on function public.block_entitlement_billing_owner_when_ownership_transfer_pending()
from public, anon, authenticated;
