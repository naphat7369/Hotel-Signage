# StayScreen — คู่มือใช้งานบนเครื่องของคุณ

## เริ่มต้น

ต้องมี Node.js 24. ใช้ PowerShell ที่ `D:\Hotel-Signage`:

```powershell
npm ci
npm run build
npm start
```

เปิด http://127.0.0.1:8787 สร้างองค์กรและผู้ดูแลครั้งแรก รหัสผ่านขั้นต่ำ 12 ตัวอักษร ไม่มีบัญชีหรือรหัสผ่านเริ่มต้น ฐานข้อมูลและไฟล์จริงอยู่ใน `data` (SQLite WAL + โฟลเดอร์ media/screens) อย่าลบ data เมื่อต้องการอัปเดตโปรแกรม

1. เพิ่มสาขาพร้อม timezone
2. อัปโหลดรูป JPEG/PNG/WebP หรือ MP4 H.264/AAC แนะนำ 1920×1080
3. สร้าง Playlist จัดลำดับและเวลาแสดงรูป วิดีโอเล่นจนจบ จากนั้นกด Publish
4. เปิด `/player` บนจอปลายทาง กดสร้างรหัส นำรหัส 6 หลักมาลงทะเบียนใน Manage Displays (อายุ 10 นาที ใช้ได้ครั้งเดียว)
5. กดตั้งงานจากจอ เลือก Playlist จอเป้าหมาย วันที่ และวันในสัปดาห์ กด Publish Schedule
6. จอ sync ทุก 30 วินาที รอให้ CMS แสดง Cache พร้อม จึงทดสอบตัดอินเทอร์เน็ต

สามารถเลือกหลายจอในสาขาเดียว กลุ่มจอ สาขา หรือทุกจอในองค์กร งานระดับจอชนะกลุ่ม ชนะสาขา ชนะองค์กร หากระดับเดียวกันใช้ Publish ล่าสุด เวลาเริ่มเท่ากับเวลาสิ้นสุดหมายถึงตลอดวัน ช่วง 22:00–02:00 ใช้วันเริ่มเป็นวันที่อ้างอิงแม้เล่นเลยเที่ยงคืน Published version เก็บสื่อและรายละเอียดเดิมไว้ การ Publish Playlist ใหม่ไม่แก้งานเก่าอัตโนมัติ

## เชื่อมจากจออื่น / ต่างสาขา

`localhost` และ `127.0.0.1` หมายถึงเครื่องที่เปิด Browser จออื่นต้องใช้ชื่อ DNS/IP ของเซิร์ฟเวอร์ ไม่ใช่ localhost

```powershell
.\scripts\start.ps1 -BindAddress 0.0.0.0 -Port 8787 -PfxPath D:\Certificates\signage.pfx
```

ใช้ใบรับรอง HTTPS ที่ทุกจอเชื่อถือ และชื่อเซิร์ฟเวอร์ต้องตรงกับใบรับรอง หรือวาง reverse proxy HTTPS ด้านหน้า Node ห้ามปิดการตรวจ certificate เพื่อแก้ปัญหา Browser Service Worker ใช้ไม่ได้บน HTTP ของ IP เครือข่ายปกติ ต้องใช้ HTTPS ที่ถูกต้องสำหรับ Web Player ต่างเครื่อง เตรียม firewall เฉพาะเครือข่ายที่ต้องใช้และ VPN/ชื่อเซิร์ฟเวอร์สำหรับต่างสาขา ไม่มีค่า Cloud ที่จำเป็น แต่ยังใช้เครื่อง ไฟฟ้า และอินเทอร์เน็ตของคุณ

สร้างผู้ดูแลแรกผ่าน localhost ก่อนเปิดให้จออื่นเข้าถึง Docker ผูก loopback เป็นค่าเริ่มต้น หากใช้ Docker ให้ย้ายฐานข้อมูลที่ตั้งค่าบนเครื่องแล้วเข้า volume หรือทำ initial setup จากภายใน container ไม่เปิด setup สาธารณะ

## Android Native APK

ซอร์สอยู่ใน `android` ใช้ Java 17 และ Android SDK 34, minSdk 26 (Android 8) ไม่มี WebView หรือ Google Play Services ใช้ MediaPlayer/TextureView ของระบบ เล่นจากไฟล์ใน app-private storage

APK ที่ build แล้วอยู่ `android/app/build/outputs/apk/debug/app-debug.apk` เป็น build สำหรับติดตั้งทดสอบ ห้ามถือเป็นการรับรองกล่องทุกยี่ห้อ เปิดแอป กรอก URL เดียวกับ CMS สร้างรหัสจับคู่แล้วลงทะเบียนตามขั้นตอนข้างต้น ใช้ HTTPS ที่ระบบ Android เชื่อถือ แนะนำทดสอบการเล่นรูป/วิดีโอและรีบูตบนกล่องที่จะติดตั้งจริง

หากกล่องรองรับการเลือก Home app ให้เลือก StayScreen เป็น Home เพื่อเปิดหลังบูตโดยระบบ ไม่บังคับ Device Owner หรือ factory reset ให้ผู้ใช้ แอปยังไม่จัดการ OS updates, remote APK updates, HDMI, หรือการเปิด TV อัตโนมัติ

## Offline, Screenshot และรายงาน

Web Player เก็บ credential, manifest และคิวรายงานใน IndexedDB; สื่ออยู่ใน Cache Storage ตรวจไฟล์ทุก 30 วินาที checksum ก่อนเล่นและหลังดาวน์โหลดใหม่ หากไฟล์ขาด ส่ง DEGRADED/CRITICAL แล้วซ่อมอัตโนมัติเมื่อมีเครือข่าย ไฟล์ชุดใหม่ต้องครบก่อนสลับ manifest หากอินเทอร์เน็ตขาดจะส่ง Alert ไป CMS ไม่ได้จนกว่าจะเชื่อมต่อใหม่ CMS ใช้ lastSeen แสดงออฟไลน์หลัง 90 วินาที หาก Browser ล้างข้อมูลไซต์ทั้งหมดต้องจับคู่ใหม่

แตะสองครั้งบน Web Player เพื่อเปิด full screen หรือขอ persistent storage การอนุญาตขึ้นกับ Browser และระบบยังสามารถล้างข้อมูลได้ Offline navigation ใช้ Service Worker ที่ต้องติดตั้งสำเร็จขณะ online ก่อน ไม่รับประกัน Smart TV Browser ที่ไม่รองรับ Chromium APIs แอปทั้งสองเล่นแบบปิดเสียงโดยค่าเริ่มต้น

Screenshot เป็นภาพสื่อที่ Player วาดอยู่ (ไม่ใช่ภาพระบบปฏิบัติการหรือสัญญาณทีวี) ส่งทุก 5 นาทีหรือเมื่อกดขอภาพใหม่ โดยคำขอรับใน heartbeat ถัดไป เก็บเฉพาะภาพล่าสุดพร้อมเวลาสื่อและเวอร์ชัน

รายงานนับเมื่อสื่อเล่นจบ ส่งเป็น batch ใช้ ID ป้องกันนับซ้ำ เก็บข้อมูลดิบ 90 วัน สรุป UTC รายวัน 24 เดือน Audit 12 เดือน เหตุการณ์ 180 วัน Heartbeat เก็บเพียงสถานะล่าสุดเพื่อประหยัดพื้นที่ ล้างข้อมูลวันละครั้งเมื่อ server ทำงาน รูป/วิดีโอ/งาน/Published versions ไม่ถูกล้างตามอายุ การลบสื่อใช้ Trash 30 วันและต้องไม่มี references

## สำรองและกู้คืน

```powershell
npm run backup
```

สำรองไป `backups/<timestamp>` เป็น SQLite online backup พร้อมไฟล์ต้นฉบับและ Screenshot ควรรันนอกเวลาแก้ไขสื่อ แล้วนำไปเก็บในไดรฟ์หรือเครื่องอื่นด้วย การมีสำเนาบนไดรฟ์เดียวไม่ป้องกันดิสก์เสีย หยุดอัปโหลดขณะสำรองเพื่อให้ไฟล์ตรงกับ snapshot

กู้คืน: หยุด server → เก็บโฟลเดอร์ data เดิมไว้เป็นสำเนา → คัดลอก `signage.sqlite`, `media`, `screens` จาก backup ไปโฟลเดอร์ data ใหม่ → เริ่ม server → ตรวจผู้ใช้ งานและเปิดต้นฉบับ ไม่คัดลอก WAL ของฐานข้อมูลเก่ามาปนกับ backup

## ตรวจสอบ

```powershell
npm test
npx tsc -p tsconfig.selfhost.json
npm run build
```

ทดสอบ API ครอบคลุม tenant/branch isolation, one-time pairing, range downloads, publish/archive, immutable snapshots, duplicate proof-of-play และ persistence หลัง restart มี Browser fixture ชั่วคราวสำหรับ QA ที่พอร์ต 8790 (`node tests/browser-fixture.mjs`) ไม่ใช่ระบบใช้งานจริง

ก่อน rollout หลายสาขายังต้องทดสอบกล่อง/ทีวีรุ่นจริง ไฟดับ รีบูต สื่อยาว พื้นที่เต็ม และ soak test 24 ชั่วโมง ปัจจุบันไม่มี billing, multi-zone layout, workflow อนุมัติ, LINE/email notification หรือ live remote desktop
