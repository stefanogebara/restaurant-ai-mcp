const mockFrom = jest.fn();
const mockRpc = jest.fn(async () => ({ error: null }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: (...a) => mockFrom(...a), rpc: (...a) => mockRpc(...a) } }));
const service = require('../_services/reservationWhatsAppDelivery');
const id = '11111111-1111-4111-8111-111111111111';
function chain(result) {
  const q = {}; for (const method of ['select','eq','in','insert','order']) q[method] = jest.fn(() => q);
  q.maybeSingle = q.single = jest.fn(async () => result);
  q.then = resolve => resolve(result); return q;
}
beforeEach(() => { jest.clearAllMocks(); process.env.WHATSAPP_PHONE_NUMBER_ID = 'sender-1'; });
test('tracks only a reservation that belongs to the bound restaurant', async () => {
  const lookup = chain({ data: null }); mockFrom.mockReturnValue(lookup);
  expect(await service.beginConfirmation({restaurantId:'r1',reservationRecordId:id,phone:'+5511'})).toBeNull();
  expect(lookup.eq).toHaveBeenCalledWith('restaurant_id','r1'); expect(mockFrom).toHaveBeenCalledTimes(1);
});
test('creates durable correlation before provider send with normalized recipient', async () => {
  const insert = chain({data:{id,sender_id:'sender-1',recipient_phone:'5511'}});
  mockFrom.mockReturnValueOnce(chain({data:{id}})).mockReturnValueOnce(insert);
  await service.beginConfirmation({restaurantId:'r1',reservationRecordId:id,phone:'+55 11'});
  expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({restaurant_id:'r1',reservation_id:id,recipient_phone:'5511'}));
});
test('receipt can match callback before the HTTP result exists; requires sender and recipient', async () => {
  await service.applyConfirmationReceipt({id:'wamid-1',status:'delivered',recipient_id:'5511',biz_opaque_callback_data:`reservation:${id}`},{phone_number_id:'sender-1'});
  expect(mockRpc).toHaveBeenCalledWith('advance_reservation_whatsapp_message',expect.objectContaining({p_id:id,p_message_id:'wamid-1',p_status:'delivered',p_sender:'sender-1',p_recipient:'5511'}));
});
test('unscoped and unsupported events cannot update a reservation', async () => {
  await service.applyConfirmationReceipt({id:'w',status:'delivered'},{});
  await service.applyConfirmationReceipt({id:'w',status:'made-up',recipient_id:'5511'},{phone_number_id:'s'});
  expect(mockRpc).not.toHaveBeenCalled();
});
test.each([[{success:true,messageId:'w'},'accepted'],[{success:false,ambiguo:true},'unknown'],[{success:false,error:'Rejected'},'failed']])('records send outcome without treating it as delivered', async (result,status) => {
  await service.finishConfirmation({id,sender_id:'s',recipient_phone:'5511'},result);
  expect(mockRpc.mock.calls[0][1]).toEqual(expect.objectContaining({p_status:status}));
});
test('dashboard joins UUIDs with authenticated tenant scope and picks latest attempt', async () => {
  const q=chain({data:[{reservation_id:id,status:'failed'},{reservation_id:id,status:'delivered'}]}); mockFrom.mockReturnValue(q);
  const result=await service.decorateReservationConfirmations('r1',[{record_id:id,reservation_id:'RES-CODE'},{record_id:'other'}]);
  expect(q.eq).toHaveBeenCalledWith('restaurant_id','r1'); expect(q.in).toHaveBeenCalledWith('reservation_id',[id,'other']);
  expect(result[0].whatsapp_confirmation.status).toBe('failed'); expect(result[1].whatsapp_confirmation).toBeNull();
});
test('missing tenant performs no privileged read', async () => {
  await service.decorateReservationConfirmations(null,[{record_id:id}]); expect(mockFrom).not.toHaveBeenCalled();
});
test('correlates Meta Brazilian recipient ids with the optional ninth digit', async () => {
  const q=chain({data:{id,sender_id:'sender-1',recipient_phone:'551199002121'}});
  mockFrom.mockReturnValueOnce(chain({data:{id}})).mockReturnValueOnce(q);
  await service.beginConfirmation({restaurantId:'r1',reservationRecordId:id,phone:'+5511999002121'});
  expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({recipient_phone:'551199002121'}));
  await service.applyConfirmationReceipt({id:'wamid-br',status:'delivered',recipient_id:'551199002121',biz_opaque_callback_data:`reservation:${id}`},{phone_number_id:'sender-1'});
  expect(mockRpc.mock.calls[0][1].p_recipient).toBe('551199002121');
});
