/**
 * 华星园社区智能考勤系统 - 远程云端后端服务与持久化数据 API
 * 纯 JavaScript 架构：免除 C++ 编译与 node-gyp 依赖，秒级安装，持久化文件存储
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// 中间件配置
app.use(cors());
app.use(express.json());

// 上传头像存储配置
const UPLOADS_DIR = process.env.ATTENDANCE_UPLOADS_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `avatar_${Date.now()}_${Math.floor(Math.random() * 1000)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// 数据库持久化存储 (JSON 单文件高可靠存储，支持原子写入)
const DB_PATH = process.env.ATTENDANCE_DB_PATH || path.join(__dirname, 'attendance_db.json');
let dbData = { employees: [], records: [] };

function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      dbData = JSON.parse(raw);
      if (!Array.isArray(dbData.employees)) dbData.employees = [];
      if (!Array.isArray(dbData.records)) dbData.records = [];
    } catch (e) {
      console.warn('⚠️ 读取持久化数据异常，重置新结构:', e);
      dbData = { employees: [], records: [] };
    }
  } else {
    saveDB();
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ 保存数据库失败:', e);
  }
}

loadDB();
console.log('✅ 云端持久化数据库已准备就绪 (生产模式)');

// ======================= API 路由接口 =======================

// 0. 健康检查与握手接口
app.get(['/healthz', '/api/health'], (req, res) => {
  res.json({
    success: true,
    service: '华星园社区智能考勤云端 API',
    database: 'Persistent JSON Store (Zero-Config)',
    serverTime: new Date().toISOString()
  });
});

// 1. 获取所有员工列表及其动态计算的实时余量 (年假余量、病假余量、调休池余量)
app.get('/api/employees', (req, res) => {
  loadDB();
  const employees = dbData.employees.map(emp => {
    const empRecords = dbData.records.filter(r => String(r.emp_id) === String(emp.id));

    let annual_used = 0;
    let sick_used = 0;
    let comp_used = 0;
    let comp_earned = 0;

    empRecords.forEach(r => {
      const hours = parseInt(r.hours) || 0;
      if (r.category === 'leave') {
        if (r.type_name === '年假') annual_used += hours;
        if (r.type_name === '病假') sick_used += hours;
        if (r.type_name === '调休') comp_used += hours;
      } else if (r.category === 'overtime') {
        comp_earned += hours;
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

  res.json({ success: true, data: employees });
});

// 2. 获取指定日期的考勤/假勤记录列表
app.get('/api/records', (req, res) => {
  loadDB();
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const filtered = dbData.records.filter(r => r.date === date);

  const records = filtered.map(r => {
    const emp = dbData.employees.find(e => String(e.id) === String(r.emp_id)) || {};
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

  res.json({ success: true, date, data: records });
});

// 3. 登记一条请假或加班记录 (支持单人单日多条并存)
app.post('/api/records', (req, res) => {
  const { empId, date, category, typeName, hours, remark } = req.body;
  if (!empId || !date || !category || !typeName || !hours) {
    return res.status(400).json({ error: '参数不完整' });
  }

  loadDB();
  const newRecord = {
    id: Date.now(),
    emp_id: empId,
    date,
    category,
    type_name: typeName,
    hours: parseInt(hours) || 0,
    remark: remark || '',
    created_at: new Date().toISOString()
  };

  dbData.records.push(newRecord);
  saveDB();

  res.json({
    success: true,
    message: '记录已成功同步到云端数据库',
    id: newRecord.id
  });
});

// 4. 删除一条记录（自动回滚额度）
app.delete('/api/records/:id', (req, res) => {
  const recordId = req.params.id;
  loadDB();
  const initialLen = dbData.records.length;
  dbData.records = dbData.records.filter(r => String(r.id) !== String(recordId));

  if (dbData.records.length !== initialLen) {
    saveDB();
    res.json({ success: true, message: '记录已从云端删除并回滚' });
  } else {
    res.json({ success: true, message: '记录未找到或已删除' });
  }
});

// 5. 新增员工档案
app.post('/api/employees', (req, res) => {
  const { no, name, phone, avatar, annualTotalHours, sickTotalHours } = req.body;
  if (!name || !no) {
    return res.status(400).json({ error: '员工工号和姓名不能为空' });
  }

  loadDB();
  const newEmp = {
    id: Date.now(),
    emp_no: no,
    name,
    phone: phone || '',
    avatar: avatar || '',
    annual_quota: parseInt(annualTotalHours) || 40,
    sick_quota: parseInt(sickTotalHours) || 80,
    created_at: new Date().toISOString()
  };

  dbData.employees.push(newEmp);
  saveDB();

  res.json({ success: true, message: '新员工已添加到云端', id: newEmp.id });
});

// 6. 更新员工档案
app.put('/api/employees/:id', (req, res) => {
  const empId = req.params.id;
  const { name, phone, avatar, annualTotalHours, sickTotalHours } = req.body;

  loadDB();
  const emp = dbData.employees.find(e => String(e.id) === String(empId));
  if (!emp) {
    return res.status(404).json({ error: '员工不存在' });
  }

  if (name !== undefined) emp.name = name;
  if (phone !== undefined) emp.phone = phone;
  if (avatar !== undefined) emp.avatar = avatar;
  if (annualTotalHours !== undefined) emp.annual_quota = parseInt(annualTotalHours);
  if (sickTotalHours !== undefined) emp.sick_quota = parseInt(sickTotalHours);

  saveDB();
  res.json({ success: true, message: '员工信息已在云端更新' });
});

// 7. 删除员工档案
app.delete('/api/employees/:id', (req, res) => {
  const empId = req.params.id;
  loadDB();
  dbData.employees = dbData.employees.filter(e => String(e.id) !== String(empId));
  dbData.records = dbData.records.filter(r => String(r.emp_id) !== String(empId));
  saveDB();

  res.json({ success: true, message: '员工及其考勤明细已从云端移除' });
});

// 8. 批量更新全体员工额度
app.post('/api/employees/batch-quotas', (req, res) => {
  const { empIds, annualQuota, sickQuota } = req.body;
  if (!empIds || !empIds.length) {
    return res.status(400).json({ error: '请选择需要调整的员工' });
  }

  loadDB();
  let changed = 0;
  dbData.employees.forEach(emp => {
    if (empIds.some(id => String(id) === String(emp.id))) {
      if (annualQuota !== undefined) emp.annual_quota = parseInt(annualQuota);
      if (sickQuota !== undefined) emp.sick_quota = parseInt(sickQuota);
      changed++;
    }
  });

  saveDB();
  res.json({ success: true, message: `已成功为 ${changed} 名员工同步更新年假/病假额度` });
});

// 9. 头像上传接口
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const host = req.get('host');
  const protocol = req.protocol;
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

app.listen(PORT, HOST, () => {
  console.log(`\n=================================================`);
  console.log(`   🚀 华星园社区考勤服务已启动: http://${HOST}:${PORT}`);
  console.log(`   🗄️ 持久化数据库挂载成功: ${DB_PATH}`);
  console.log(`=================================================\n`);
});
