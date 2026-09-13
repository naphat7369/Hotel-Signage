import { DatabaseSync } from "node:sqlite";
import { scryptSync, randomBytes, randomUUID } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(process.env.DATA_DIR || join(root, "data"));
const db = new DatabaseSync(join(dataDir, "signage.sqlite"));

const email = (process.argv[2] || process.env.ADMIN_EMAIL || "admin@shotel.com").toLowerCase().trim();
const password = process.argv[3] || process.env.ADMIN_PASSWORD || "admin12345678";
const name = process.argv[4] || process.env.ADMIN_NAME || "Shotel Administrator";

if (password.length < 12) {
  console.error("❌ ข้อผิดพลาด: รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร");
  process.exit(1);
}

function hashPassword(p) {
  const salt = randomBytes(32).toString("base64url");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}

const hash = hashPassword(password);
const existing = db.prepare("SELECT * FROM users WHERE email=?").get(email);

if (existing) {
  db.prepare("UPDATE users SET hash=?, name=? WHERE id=?").run(hash, name, existing.id);
  console.log(`✅ [Shotel] อัปเดตรหัสผ่านสำหรับ ${email} เรียบร้อยแล้ว!`);
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Password: ${password}`);
} else {
  let org = db.prepare("SELECT id FROM entities WHERE kind='organizations' LIMIT 1").get();
  let orgId = org ? org.id : randomUUID();
  if (!org) {
    const now = Date.now();
    db.prepare("INSERT INTO entities VALUES(?,?,?,?,?,?,?)").run(
      orgId,
      "organizations",
      orgId,
      "",
      JSON.stringify({ name: "Shotel Hotel", quota: 10 * 1024 ** 3 }),
      now,
      now
    );
  }
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)").run(
    randomUUID(),
    email,
    name,
    "platform",
    orgId,
    "",
    hash,
    Date.now()
  );
  console.log(`✅ [Shotel] สร้างผู้ดูแลระบบใหม่ ${email} เรียบร้อยแล้ว!`);
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Password: ${password}`);
}

db.close();
