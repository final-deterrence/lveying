const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

async function main() {
  process.umask(0o077);
  const dataDir = path.resolve(process.env.LVEYING_DATA_DIR || 'data');
  const source = path.join(dataDir, 'lveying.sqlite');
  if (!fs.existsSync(source)) throw new Error('SQLite 数据库尚未创建，请先启动网站并访问业务接口');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.resolve(process.argv[2] || path.join(dataDir, 'backups', `lveying-${stamp}.sqlite`));
  if (fs.existsSync(destination)) throw new Error('备份目标已存在，请选择新的文件名');
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  // 在线备份 API 会包含 WAL 中尚未合并的数据，不能以普通文件复制代替。
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, destination);
    fs.chmodSync(destination, 0o600);
    console.log(`数据库已备份到 ${destination}`);
  } finally {
    db.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
