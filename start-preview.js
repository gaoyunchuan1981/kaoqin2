/**
 * 华星园社区考勤系统 - 手机局域网实时预览与安装服务
 * 运行方式：node start-preview.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const ASSETS_DIR = path.join(__dirname, 'app', 'src', 'main', 'assets');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

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

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
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
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const ips = getLocalIps();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log('   🚀 华星园社区智能考勤系统 - 手机端服务已启动');
  console.log('======================================================');
  console.log(`\n💻 本机电脑浏览器访问: http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log('\n📱 手机同一 Wi-Fi 下直接访问以下地址：');
    ips.forEach(ip => {
      console.log(`   👉 http://${ip.address}:${PORT} (${ip.name})`);
    });
  } else {
    console.log(`📱 手机无线访问: http://localhost:${PORT}`);
  }
  console.log('\n💡 提示：');
  console.log('   1. 手机打开上述地址即可全功能体验。');
  console.log('   2. 在手机浏览器点击「添加到主屏幕」，即可像原生 APP 一样生成独立桌面图标离线使用。');
  console.log('======================================================\n');
});
