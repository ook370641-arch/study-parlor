const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const nodeModulesDir = path.join(projectRoot, 'node_modules')
const envFile = path.join(projectRoot, '.env')
const envExampleFile = path.join(projectRoot, '.env.example')

// 1. Check node_modules
if (!fs.existsSync(nodeModulesDir)) {
  console.error('\x1b[31m错误：未找到 node_modules/\x1b[0m')
  console.log('请先运行 \x1b[33mnpm install\x1b[0m 安装依赖，然后再启动应用。')
  console.log('\n步骤：')
  console.log('  1. cd 到项目根目录')
  console.log('  2. npm install')
  console.log('  3. npm run dev')
  process.exit(1)
}

// 2. Check .env, create from example if missing
if (!fs.existsSync(envFile)) {
  if (fs.existsSync(envExampleFile)) {
    fs.copyFileSync(envExampleFile, envFile)
    console.log('\x1b[33m已自动从 .env.example 创建 .env 文件，请在应用内完成配置。\x1b[0m')
  } else {
    console.warn('\x1b[33m警告：.env.example 不存在，请手动创建 .env 文件。\x1b[0m')
  }
}

process.exit(0)

