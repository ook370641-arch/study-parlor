const { writeManifest } = require('./vite-paintings-plugin.cjs')
const count = writeManifest()
console.log(`[manifest] generated ${count} paintings`)
