const supabase = require('./_supabase');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('config')
      .select('*')
      .eq('id', 1)
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({
      alertDays: data.alert_days,
      popup: data.popup,
      autoHoly: data.auto_holy,
      trashDays: data.trash_days,
    });
  }

  if (req.method === 'PUT') {
    const { alertDays, popup, autoHoly, trashDays } = req.body;
    const { error } = await supabase
      .from('config')
      .update({ alert_days: alertDays, popup, auto_holy: autoHoly, trash_days: trashDays })
      .eq('id', 1);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
