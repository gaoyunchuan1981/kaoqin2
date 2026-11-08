#!/bin/bash
set -e

echo "=================================================="
echo "🚀 华星园社区智能考勤系统 - 阿里云一键部署脚本"
echo "=================================================="

# 1. 确保目录存在
mkdir -p ~/kaoqin2/server
cd ~/kaoqin2/server

# 2. 下载必要核心文件
echo "📥 正在下载后端生产服务与配置..."
curl -sSL "https://cdn.jsdelivr.net/gh/gaoyunchuan1981/kaoqin2@main/server/package.json" -o package.json
curl -sSL "https://cdn.jsdelivr.net/gh/gaoyunchuan1981/kaoqin2@main/server/server.js" -o server.js

# 3. 检查并安装 Node.js 环境 (如果未安装)
if ! command -v node &> /dev/null; then
    echo "⚙️ 正在安装 Node.js 环境..."
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    fi
fi

# 4. 安装依赖 (使用阿里云 npm 镜像源)
echo "📦 正在使用国内镜像安装服务依赖..."
npm install --registry=https://registry.npmmirror.com

# 5. 安装并使用 PM2 常驻后台
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
echo "数据库: ~/kaoqin2/server/attendance.db (SQLite)"
echo "=================================================="
pm2 status
