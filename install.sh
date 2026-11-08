#!/bin/bash
set -e

echo "=================================================="
echo "🚀 华星园社区智能考勤系统 - 阿里云免编译秒级部署"
echo "=================================================="

# 1. 确保目录存在
mkdir -p ~/kaoqin2/server
cd ~/kaoqin2/server

# 2. 下载必要核心文件
echo "📥 正在下载后端生产服务与配置..."
curl -sSL "https://cdn.jsdelivr.net/gh/gaoyunchuan1981/kaoqin2@main/server/package.json" -o package.json
curl -sSL "https://cdn.jsdelivr.net/gh/gaoyunchuan1981/kaoqin2@main/server/server.js" -o server.js

# 3. 安装纯 JS 依赖 (免除了 C++ 编译与 node-gyp 依赖，秒级完成)
echo "📦 正在安装依赖 (express, cors, multer)..."
npm install --registry=https://registry.npmmirror.com

# 4. 配置并启动 PM2 常驻后台
echo "🛡️ 正在配置后台常驻守护进程..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2 --registry=https://registry.npmmirror.com
fi

pm2 delete attendance-api 2>/dev/null || true
pm2 start server.js --name "attendance-api"
pm2 save
pm2 startup 2>/dev/null || true

echo "=================================================="
echo "✅ 华星园考勤云端 API 服务已成功启动！"
echo "端口: 3000 (监听 0.0.0.0:3000)"
echo "数据库: ~/kaoqin2/server/attendance_db.json"
echo "=================================================="
pm2 status
