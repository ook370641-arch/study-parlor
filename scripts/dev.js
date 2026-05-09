// Workaround for ELECTRON_RUN_AS_NODE being set in the environment,
// which causes require("electron") to return a string path instead of API objects.
if ('ELECTRON_RUN_AS_NODE' in process.env) {
  delete process.env.ELECTRON_RUN_AS_NODE
}

const { spawn } = require('child_process')
const args = process.argv.slice(2)
spawn('electron-vite', args, { stdio: 'inherit', shell: true })