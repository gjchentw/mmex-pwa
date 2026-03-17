import fs from 'fs';
const files = fs.readdirSync('dist/assets').filter(f => f.startsWith('sqlite.worker') && f.endsWith('.js'));
for (const f of files) {
  const code = fs.readFileSync('dist/assets/' + f, 'utf8');
  if (code.includes('sqlite3.wasm')) {
    console.log(`Found in ${f}`);
    const match = code.match(/locateFile:\s*(.*?)\s*}/s);
    if (match) {
        console.log("locateFile code:", match[0].substring(0, 100));
    }
  }
}
