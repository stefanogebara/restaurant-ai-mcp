const { Readable } = require('stream');
const mockReceipt = jest.fn(async () => {});
const mockVerify = jest.fn(async () => true);
jest.mock('../_services/reservationWhatsAppDelivery', () => ({applyConfirmationReceipt: (...a) => mockReceipt(...a)}));
jest.mock('../_services/campaignService', () => ({updateDeliveryStatus: jest.fn(async()=>{})}));
jest.mock('../_services/whatsappTestMessageService', () => ({updateWhatsAppTestMessageStatus: jest.fn(async()=>{})}));
jest.mock('../_lib/channels/meta-adapter', () => ({MetaAdapter: jest.fn(()=>({verifySignature:(...a)=>mockVerify(...a)}))}));
jest.mock('../_lib/prospecting/routing', () => ({isProspectingNumber:()=>false}));
const handler = require('../whatsapp-webhook');
function request(body) { const req=Readable.from([Buffer.from(JSON.stringify(body))]); return Object.assign(req,{method:'POST',headers:{},body}); }
function response() {const r={headersSent:false,setHeader:jest.fn()};r.status=jest.fn(()=>r);r.json=jest.fn(()=>r);return r;}
beforeEach(()=>{jest.clearAllMocks();mockVerify.mockResolvedValue(true)});
const change = (id) => ({field:'messages',value:{metadata:{phone_number_id:'sender'},statuses:[{id,status:'delivered',recipient_id:'5511'}]}});
test('processes every signed status in all entries and changes',async()=>{
 const res=response(); await handler(request({entry:[{changes:[change('a'),change('b')]},{changes:[change('c')]}]}),res);
 expect(mockReceipt.mock.calls.map(c=>c[0].id)).toEqual(['a','b','c']);expect(res.status).toHaveBeenCalledWith(200);
});
test('invalid signatures cannot advance delivery',async()=>{
 mockVerify.mockResolvedValue(false);await handler(request({entry:[{changes:[change('a')]}]}),response());expect(mockReceipt).not.toHaveBeenCalled();
});
test('database failure asks Meta to retry rather than losing the receipt',async()=>{
 mockReceipt.mockRejectedValueOnce(new Error('DB unavailable'));const res=response();await handler(request({entry:[{changes:[change('a')]}]}),res);expect(res.status).toHaveBeenCalledWith(503);
});
