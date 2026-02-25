import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const VTP_BASE = 'https://partner.viettelpost.vn/v2';

// Dev proxy plugin: mimic Vercel serverless /api/viettelpost
function vtpDevProxy() {
  return {
    name: 'vtp-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/viettelpost', async (req, res) => {
        if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
        if (req.method !== 'POST') { res.writeHead(405); res.end('Method not allowed'); return; }

        let body = '';
        for await (const chunk of req) body += chunk;
        let parsed;
        try { parsed = JSON.parse(body); } catch { res.writeHead(400); res.end('Invalid JSON'); return; }

        const { action, token, ...params } = parsed;
        if (!action) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing action' })); return; }

        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Token'] = token;

        let url, method = 'GET', fetchBody = null;

        if (action === 'get_provinces') {
          url = VTP_BASE + '/categories/listProvince';
        } else if (action === 'get_districts') {
          url = VTP_BASE + '/categories/listDistrict?provinceId=' + params.provinceId;
        } else if (action === 'get_wards') {
          url = VTP_BASE + '/categories/listWards?districtId=' + params.districtId;
        } else if (action === 'calculate_fee') {
          url = VTP_BASE + '/order/getPrice'; method = 'POST';
          fetchBody = JSON.stringify(params.data || params.body);
        } else if (action === 'create_order') {
          // Handle createOrder riêng với debug + empty response handling
          const orderBody = params.data || params.body;
          const vtpUrl = VTP_BASE + '/order/createOrder';
          console.log('[VTP DEV createOrder] URL:', vtpUrl);
          console.log('[VTP DEV createOrder] Token:', token ? `${token.slice(0, 30)}...` : 'MISSING');
          console.log('[VTP DEV createOrder] Body:', JSON.stringify(orderBody, null, 2));
          try {
            const vtpResp = await fetch(vtpUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Token': token || '' },
              body: JSON.stringify(orderBody)
            });
            const rawText = await vtpResp.text();
            console.log('[VTP DEV createOrder] Response status:', vtpResp.status);
            console.log('[VTP DEV createOrder] Response:', rawText.slice(0, 2000));
            res.setHeader('Content-Type', 'application/json');
            if (!rawText || rawText.trim() === '') {
              res.writeHead(200);
              res.end(JSON.stringify({ error: true, status: vtpResp.status, message: `VTP trả về response rỗng (HTTP ${vtpResp.status}). Token có thể hết hạn.` }));
            } else {
              res.writeHead(200);
              res.end(rawText);
            }
          } catch (err) {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify({ error: true, message: 'Lỗi kết nối VTP: ' + err.message }));
          }
          return;
        } else if (action === 'get_order_detail') {
          url = VTP_BASE + '/order/getTracking?ORDER_NUMBER=' + (params.orderNumber || params.orderId);
        } else if (action === 'login') {
          url = VTP_BASE + '/user/Login'; method = 'POST';
          fetchBody = JSON.stringify({ USERNAME: params.username, PASSWORD: params.password });
        } else if (action === 'get_services') {
          url = VTP_BASE + '/categories/listService'; method = 'POST';
          fetchBody = JSON.stringify({});
        } else if (action === 'get_price_all') {
          url = VTP_BASE + '/order/getPriceAll'; method = 'POST';
          fetchBody = JSON.stringify(params.data || params.body);
        } else {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid action: ' + action })); return;
        }

        try {
          const opts = { method, headers };
          if (fetchBody) opts.body = fetchBody;
          const resp = await fetch(url, opts);
          const text = await resp.text();
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(text);
        } catch (err) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vtpDevProxy()],
})
