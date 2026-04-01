// Temporary debug endpoint - DELETE after testing
module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL || '';
  const keyLen = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').length;

  // Test actual Supabase query
  let queryResult = null;
  try {
    const { supabaseAdmin } = require('./_lib/supabase');
    const { data, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, manager_phone, manager_whatsapp_verified')
      .not('manager_phone', 'is', null);
    queryResult = { count: data?.length, error: error?.message, ids: (data || []).map(d => d.id.slice(0, 8)) };
  } catch (e) {
    queryResult = { exception: e.message };
  }

  res.json({
    supabase_url: url,
    url_length: url.length,
    url_ends_with: url.slice(-5),
    key_length: keyLen,
    query: queryResult,
  });
};
