/**
 * 华星园社区考勤系统 - 本地测试环境服务 (含独立测试数据库)
 * - 静态页面服务：http://localhost:3000
 * - 本地独立测试数据库：local_test_db.json (绝不污染阿里云生产数据库)
 * - 支持手机局域网与电脑本地直接测试体验
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || parseInt(process.argv[2], 10) || 3000;
const ASSETS_DIR = path.join(__dirname, 'app', 'src', 'main', 'assets');
const LOCAL_DB_FILE = path.join(__dirname, 'local_test_db.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive'
};

// ==================== 本地测试数据库存取 ====================
let testDb = { employees: [], records: [] };

function loadTestDB() {
  if (fs.existsSync(LOCAL_DB_FILE)) {
    try {
      const content = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
      testDb = JSON.parse(content);
      if (!Array.isArray(testDb.employees)) testDb.employees = [];
      if (!Array.isArray(testDb.records)) testDb.records = [];
    } catch (e) {
      console.warn('⚠️ 读取本地测试数据库失败，初始化结构:', e);
    }
  } else {
    saveTestDB();
  }
}

function saveTestDB() {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(testDb, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ 保存本地测试数据库失败:', e);
  }
}

loadTestDB();

function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!iface.address.startsWith('169.254.') && !iface.address.startsWith('198.18.')) {
          ips.push({ name, address: iface.address });
        }
      }
    }
  }
  return ips;
}

// 辅助函数：读取 HTTP Body
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// ==================== HTTP 服务 ====================
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = urlObj.pathname;

  // 1. CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // 2. 根路径自动重定向至专属后缀 /kaoqin/
  if (pathname === '/' || pathname === '') {
    res.writeHead(302, { 'Location': '/kaoqin/' });
    res.end();
    return;
  }

  // /kaoqin 自动补齐结尾斜杠 /kaoqin/
  if (pathname === '/kaoqin') {
    res.writeHead(301, { 'Location': '/kaoqin/' });
    res.end();
    return;
  }

  // 剥离专属后缀 /kaoqin 前缀，使内部路由和静态文件映射无缝统一
  if (pathname.startsWith('/kaoqin/')) {
    pathname = pathname.slice('/kaoqin'.length); // /kaoqin/ -> /，/kaoqin/api/... -> /api/...
  }

  // 3. 本地测试 API 路由 (/api/*)
  if (pathname.startsWith('/api')) {
    loadTestDB();

    // GET /api/health
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, {
        success: true,
        env: 'local_test',
        service: '华星园社区智能考勤 (本地独立测试数据库)',
        database: 'local_test_db.json',
        employeeCount: testDb.employees.length,
        recordCount: testDb.records.length,
        serverTime: new Date().toISOString()
      });
    }

    // GET /api/employees
    if (pathname === '/api/employees' && req.method === 'GET') {
      const employees = testDb.employees.map(emp => {
        const empRecords = testDb.records.filter(r => String(r.emp_id) === String(emp.id));
        let annual_used = 0, sick_used = 0, comp_used = 0, comp_earned = 0;

        empRecords.forEach(r => {
          const h = parseInt(r.hours) || 0;
          if (r.category === 'leave') {
            if (r.type_name === '年假') annual_used += h;
            if (r.type_name === '病假') sick_used += h;
            if (r.type_name === '调休') comp_used += h;
          } else if (r.category === 'overtime') {
            comp_earned += h;
          }
        });

        const annualTotal = parseInt(emp.annual_quota) || 40;
        const sickTotal = parseInt(emp.sick_quota) || 80;

        return {
          id: emp.id,
          no: emp.emp_no,
          name: emp.name,
          phone: emp.phone || '',
          avatar: emp.avatar || '',
          annualTotalHours: annualTotal,
          sickTotalHours: sickTotal,
          annualRemainHours: Math.max(0, annualTotal - annual_used),
          sickRemainHours: Math.max(0, sickTotal - sick_used),
          compLeaveHours: Math.max(0, comp_earned - comp_used),
          records: []
        };
      });
      return sendJson(res, { success: true, env: 'local_test', data: employees });
    }

    // POST /api/employees (新增)
    if (pathname === '/api/employees' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name || !body.no) {
        return sendJson(res, { error: '工号与姓名不能为空' }, 400);
      }
      const newEmp = {
        id: Date.now(),
        emp_no: body.no,
        name: body.name,
        phone: body.phone || '',
        avatar: body.avatar || '',
        annual_quota: parseInt(body.annualTotalHours) || 40,
        sick_quota: parseInt(body.sickTotalHours) || 80,
        created_at: new Date().toISOString()
      };
      testDb.employees.push(newEmp);
      saveTestDB();
      return sendJson(res, { success: true, message: '测试员工已添加至本地测试库', id: newEmp.id });
    }

    // PUT /api/employees/:id (更新)
    if (pathname.startsWith('/api/employees/') && req.method === 'PUT') {
      const empId = pathname.replace('/api/employees/', '');
      const body = await readBody(req);
      const emp = testDb.employees.find(e => String(e.id) === String(empId));
      if (!emp) return sendJson(res, { error: '员工不存在' }, 404);

      if (body.name !== undefined) emp.name = body.name;
      if (body.phone !== undefined) emp.phone = body.phone;
      if (body.avatar !== undefined) emp.avatar = body.avatar;
      if (body.annualTotalHours !== undefined) emp.annual_quota = parseInt(body.annualTotalHours);
      if (body.sickTotalHours !== undefined) emp.sick_quota = parseInt(body.sickTotalHours);
      saveTestDB();
      return sendJson(res, { success: true, message: '本地测试员工已更新' });
    }

    // DELETE /api/employees/:id (删除)
    if (pathname.startsWith('/api/employees/') && req.method === 'DELETE') {
      const empId = pathname.replace('/api/employees/', '');
      testDb.employees = testDb.employees.filter(e => String(e.id) !== String(empId));
      testDb.records = testDb.records.filter(r => String(r.emp_id) !== String(empId));
      saveTestDB();
      return sendJson(res, { success: true, message: '本地测试员工已删除' });
    }

    // GET /api/records
    if (pathname === '/api/records' && req.method === 'GET') {
      const date = urlObj.searchParams.get('date') || new Date().toISOString().split('T')[0];
      const filtered = testDb.records.filter(r => r.date === date);
      const records = filtered.map(r => {
        const emp = testDb.employees.find(e => String(e.id) === String(r.emp_id)) || {};
        return {
          id: r.id,
          empId: r.emp_id,
          date: r.date,
          category: r.category,
          type: r.type_name,
          hours: r.hours,
          remark: r.remark || '',
          emp_name: emp.name || '',
          emp_no: emp.emp_no || ''
        };
      });
      return sendJson(res, { success: true, date, data: records });
    }

    // POST /api/records (请假/值班登记)
    if (pathname === '/api/records' && req.method === 'POST') {
      const body = await readBody(req);
      const newRec = {
        id: Date.now(),
        emp_id: body.empId,
        date: body.date,
        category: body.category,
        type_name: body.typeName,
        hours: parseInt(body.hours) || 0,
        remark: body.remark || '',
        created_at: new Date().toISOString()
      };
      testDb.records.push(newRec);
      saveTestDB();
      return sendJson(res, { success: true, message: '测试记录已保存至本地测试库', id: newRec.id });
    }

    // DELETE /api/records/:id
    if (pathname.startsWith('/api/records/') && req.method === 'DELETE') {
      const recId = pathname.replace('/api/records/', '');
      testDb.records = testDb.records.filter(r => String(r.id) !== String(recId));
      saveTestDB();
      return sendJson(res, { success: true, message: '本地测试记录已移除' });
    }

    // POST /api/employees/batch-quotas
    if (pathname === '/api/employees/batch-quotas' && req.method === 'POST') {
      const body = await readBody(req);
      testDb.employees.forEach(emp => {
        if ((body.empIds || []).some(id => String(id) === String(emp.id))) {
          if (body.annualQuota !== undefined) emp.annual_quota = parseInt(body.annualQuota);
          if (body.sickQuota !== undefined) emp.sick_quota = parseInt(body.sickQuota);
        }
      });
      saveTestDB();
      return sendJson(res, { success: true, message: '本地测试额度批量更新成功' });
    }

    // POST /api/upload-avatar (本地测试直接返回成功)
    if (pathname === '/api/upload-avatar' && req.method === 'POST') {
      return sendJson(res, { success: true, url: '' });
    }

    return sendJson(res, { error: 'Not found in test API' }, 404);
  }

  // 3. 静态前端资源托管 (app/src/main/assets/)
  let reqPath = pathname;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.join(ASSETS_DIR, reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIps();
  console.log('\n======================================================');
  console.log('🚀 华星园社区智能考勤系统 - 本地独立测试服务已启动');
  console.log(`📁 本地测试数据库挂载: ${LOCAL_DB_FILE}`);
  console.log('------------------------------------------------------');
  console.log(`💻 电脑测试预览:   http://localhost:${PORT}/kaoqin/`);
  ips.forEach(ip => {
    console.log(`📱 手机测试预览:   http://${ip.address}:${PORT}/kaoqin/ (${ip.name})`);
  });
  console.log(`🎨 图标设计全景:   http://localhost:${PORT}/kaoqin/icons.html`);
  console.log(`🔀 根路径自动重定向: http://localhost:${PORT}/ -> /kaoqin/`);
  console.log('======================================================\n');
});
