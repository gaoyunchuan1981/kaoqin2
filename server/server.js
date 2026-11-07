/**
 * 华星园社区智能考勤系统 - 远程云端后端服务与数据库 API
 * 基于 Express + SQLite (轻量、免独立数据库配置、单文件持久化)
 */

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());

// 上传头像存储配置
const UPLOADS_DIR = path.join(__dirname, 'uploads');
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

// 数据库初始化
const DB_PATH = path.join(__dirname, 'attendance.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  // 1. 员工表
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      avatar TEXT,
      annual_quota INTEGER DEFAULT 40,
      sick_quota INTEGER DEFAULT 80,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. 假勤记录明细表
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      category TEXT NOT NULL, -- 'leave' (请假) 或 'overtime' (加班/值班)
      type_name TEXT NOT NULL, -- '年假' | '病假' | '调休' | '事假' | '值班' | '加班'
      hours INTEGER NOT NULL,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (emp_id) REFERENCES employees(id)
    )
  `);

  // 初始化默认员工数据（仅首次建表时填充）
  db.get("SELECT COUNT(*) as count FROM employees", (err, row) => {
    if (row && row.count === 0) {
      const stmt = db.prepare(`
        INSERT INTO employees (emp_no, name, phone, avatar, annual_quota, sick_quota)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run("EMP-001", "陈晓", "13800138001", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150", 40, 80);
      stmt.run("EMP-002", "张健", "13912345678", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", 64, 72);
      stmt.run("EMP-003", "李慧敏", "13766668888", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150", 32, 80);
      stmt.run("EMP-004", "王强", "15988889999", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", 56, 64);
      stmt.finalize();
      console.log('✅ 初始化社区员工数据成功！');
    }
  });
});

// ======================= API 路由接口 =======================

// 1. 获取所有员工列表及其动态计算的实时余量 (年假余量、病假余量、调休池余量)
app.get('/api/employees', (req, res) => {
  const query = `
    SELECT 
      e.id, e.emp_no, e.name, e.phone, e.avatar, e.annual_quota, e.sick_quota,
      COALESCE(SUM(CASE WHEN r.category = 'leave' AND r.type_name = '年假' THEN r.hours ELSE 0 END), 0) AS annual_used,
      COALESCE(SUM(CASE WHEN r.category = 'leave' AND r.type_name = '病假' THEN r.hours ELSE 0 END), 0) AS sick_used,
      COALESCE(SUM(CASE WHEN r.category = 'leave' AND r.type_name = '调休' THEN r.hours ELSE 0 END), 0) AS comp_used,
      COALESCE(SUM(CASE WHEN r.category = 'overtime' THEN r.hours ELSE 0 END), 0) AS comp_earned
    FROM employees e
    LEFT JOIN attendance_records r ON e.id = r.emp_id
    GROUP BY e.id
    ORDER BY e.id ASC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const employees = rows.map(r => ({
      id: r.id,
      empNo: r.emp_no,
      name: r.name,
      phone: r.phone,
      avatar: r.avatar,
      annualQuota: r.annual_quota,
      sickQuota: r.sick_quota,
      annualRemaining: Math.max(0, r.annual_quota - r.annual_used),
      sickRemaining: Math.max(0, r.sick_quota - r.sick_used),
      compRemaining: Math.max(0, r.comp_earned - r.comp_used)
    }));
    res.json({ success: true, data: employees });
  });
});

// 2. 获取指定日期的考勤/假勤记录列表
app.get('/api/records', (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  db.all(`
    SELECT r.*, e.name as emp_name, e.emp_no
    FROM attendance_records r
    JOIN employees e ON r.emp_id = e.id
    WHERE r.date = ?
    ORDER BY r.created_at ASC
  `, [date], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, date, data: rows });
  });
});

// 3. 登记一条请假或加班记录 (支持单人单日多条并存)
app.post('/api/records', (req, res) => {
  const { empId, date, category, typeName, hours, remark } = req.body;
  if (!empId || !date || !category || !typeName || !hours) {
    return res.status(400).json({ error: '参数不完整' });
  }

  const stmt = db.prepare(`
    INSERT INTO attendance_records (emp_id, date, category, type_name, hours, remark)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(empId, date, category, typeName, parseInt(hours), remark || '', function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({
      success: true,
      message: '记录已成功同步到云端',
      id: this.lastID
    });
  });
});

// 4. 删除一条记录（自动回滚额度）
app.delete('/api/records/:id', (req, res) => {
  const recordId = req.params.id;
  db.run(`DELETE FROM attendance_records WHERE id = ?`, [recordId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: '记录已撤回删除' });
  });
});

// 5. 更新单个员工的年假/病假初始化额度
app.put('/api/employees/:id/quotas', (req, res) => {
  const empId = req.params.id;
  const { annualQuota, sickQuota } = req.body;
  db.run(`
    UPDATE employees 
    SET annual_quota = COALESCE(?, annual_quota),
        sick_quota = COALESCE(?, sick_quota)
    WHERE id = ?
  `, [annualQuota, sickQuota, empId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: '员工额度已更新' });
  });
});

// 6. 批量更新全体员工额度
app.post('/api/employees/batch-quotas', (req, res) => {
  const { annualQuota, sickQuota } = req.body;
  db.run(`
    UPDATE employees 
    SET annual_quota = COALESCE(?, annual_quota),
        sick_quota = COALESCE(?, sick_quota)
  `, [annualQuota, sickQuota], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: '全体员工额度批量同步完成' });
  });
});

// 7. 头像上传接口
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const host = req.get('host');
  const protocol = req.protocol;
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=================================================`);
  console.log(`   🚀 华星园社区考勤云端服务已启动: http://localhost:${PORT}`);
  console.log(`   🗄️ 数据库: SQLite 嵌入式免配置数据库已挂载`);
  console.log(`=================================================\n`);
});
