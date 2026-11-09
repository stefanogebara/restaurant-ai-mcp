-- No sends. All fixture writes and realtime touches are rolled back.
BEGIN;
DO $$
DECLARE rid uuid; tenant uuid; tracking uuid; current_state text;
BEGIN
  SELECT r.id,r.restaurant_id INTO rid,tenant FROM public.reservations r
    JOIN restaurant.restaurant_config c ON c.id=r.restaurant_id
    WHERE c.restaurant_name='Seatable CI Sandbox' AND r.customer_name='Test Seatable'
    ORDER BY r.created_at DESC LIMIT 1;
  IF rid IS NULL THEN RAISE EXCEPTION 'Sandbox fixture missing'; END IF;
  INSERT INTO public.reservation_whatsapp_messages(restaurant_id,reservation_id,recipient_phone,sender_id)
    VALUES(tenant,rid,'5511000000000','test-sender') RETURNING id INTO tracking;
  -- Receipt arrives before the HTTP response; callback UUID resolves the pending row.
  PERFORM public.advance_reservation_whatsapp_message(tracking,'test-wamid','delivered','test-sender','5511000000000');
  PERFORM public.advance_reservation_whatsapp_message(tracking,'test-wamid','accepted','test-sender','5511000000000');
  PERFORM public.advance_reservation_whatsapp_message(NULL,'test-wamid','sent','test-sender','5511000000000');
  PERFORM public.advance_reservation_whatsapp_message(tracking,'test-wamid','failed','test-sender','5511000000000');
  SELECT status INTO current_state FROM public.reservation_whatsapp_messages WHERE id=tracking;
  IF current_state <> 'delivered' THEN RAISE EXCEPTION 'Late event regressed delivery: %',current_state; END IF;
  PERFORM public.advance_reservation_whatsapp_message(tracking,'test-wamid','read','wrong-sender','5511000000000');
  PERFORM public.advance_reservation_whatsapp_message(tracking,'test-wamid','read','test-sender','wrong-recipient');
  PERFORM public.advance_reservation_whatsapp_message(tracking,'different-wamid','read','test-sender','5511000000000');
  SELECT status INTO current_state FROM public.reservation_whatsapp_messages WHERE id=tracking;
  IF current_state <> 'delivered' THEN RAISE EXCEPTION 'Wrong route updated delivery'; END IF;
  PERFORM public.advance_reservation_whatsapp_message(NULL,'test-wamid','read','test-sender','5511000000000');
  PERFORM public.advance_reservation_whatsapp_message(tracking,'test-wamid','delivered','test-sender','5511000000000');
  SELECT status INTO current_state FROM public.reservation_whatsapp_messages WHERE id=tracking;
  IF current_state <> 'read' THEN RAISE EXCEPTION 'Read receipt regressed'; END IF;
  IF has_table_privilege('authenticated','public.reservation_whatsapp_messages','SELECT')
    OR has_table_privilege('anon','public.reservation_whatsapp_messages','SELECT')
    OR has_function_privilege('authenticated','public.advance_reservation_whatsapp_message(uuid,text,text,text,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'Privileged tracking exposed'; END IF;
END $$;
ROLLBACK;
