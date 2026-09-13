# StayScreen — Professional UX/UI specification

สถานะ: เตรียมแบบเพื่อจัดทำใน Figma; ยังไม่ได้สร้าง Figma file เนื่องจาก connector ตอบ UNAUTHORIZED (OAuth)

## Product direction

ระบบควบคุมจอโรงแรมสำหรับทีมส่วนกลางและทีมสาขา งานหลักคือเห็นว่าจอไหนพร้อม เลือกงานให้ถูกจอ และตรวจสิ่งที่เล่นอยู่ได้อย่างมั่นใจ ใช้ Navy สำหรับ navigation, Teal สำหรับ primary actions, พื้นทำงานขาวอมเทา และ Amber/Red สำหรับปัญหาที่ต้องแก้

ภาษา UI หลักเป็นไทย เก็บชื่อ Displays, Playlists, Schedules ที่ผู้ใช้งานคุ้นเคย ตัวอักษรหลัก 16/26 px, label 14/22 px, secondary metadata 12/18 px, หัวข้อหน้า 30/40 px ไม่ใช้ตัวหนังสือเล็กในตารางข้อมูลสำคัญ แบบ Figma ใช้ Noto Sans Thai; code ปัจจุบันใช้ Leelawadee UI, Tahoma, Arial จึงต้องเพิ่มฟอนต์ไทยที่แจกจ่ายได้ก่อนยืนยัน font parity

## Navigation and page layouts

- Sidebar 240 px: โลโก้ → ตัวเลือกองค์กร → งานประจำวัน (Overview, Displays, Media, Playlists, Schedules) → การบริหาร (Branches, Users, Reports, Storage) → บัญชีผู้ใช้
- Header 72 px: breadcrumb องค์กร/สาขา, เวลา sync ล่าสุด, บัญชีและสิทธิ์ ไม่ใช้การแจ้งเตือนปลอม
- Desktop 1440 px: เนื้อหาห่างขอบ 32 px, grid gap 24 px; ใช้ตารางสำหรับเปรียบเทียบจอจำนวนมาก และ card view เมื่อต้องการดูภาพ
- Tablet 1024 px: sidebar ย่อ, แสดงตารางที่เลื่อนได้เฉพาะส่วนข้อมูล
- Mobile 390 px: navigation เปิดจาก menu, filters ย่อ, รายการจอเป็น card, primary action มองเห็นได้โดยไม่ล้นจอ

## Frames to build in Figma

### 01 — Overview

แสดง 4 ค่า: จอทั้งหมด / จอออนไลน์ / สื่อยังไม่พร้อม / งานที่เผยแพร่แล้ว ตามด้วยเหตุการณ์ที่ต้องดำเนินการและการแสดงผลล่าสุด ไม่แสดงจำนวนงาน Published ว่า “กำลังเล่น” หากไม่มี heartbeat ยืนยัน

### 02 — Manage Displays (primary screen)

หัวข้อ “Displays” และปุ่ม “ลงทะเบียนจอ” → ตัวเลือกสาขา กลุ่ม สถานะ ค้นหา และ Table/Card toggle → รายการจอ

แต่ละรายการมีชื่อจอ ตำแหน่ง สาขา ประเภท Player, Connectivity, Offline Readiness, งานปัจจุบัน และ Last Seen โดยแยก Connectivity ออกจาก Offline Readiness: จออาจ offline แต่ cache ครบ หรือ online แต่ cache เสียได้

Actions: ตั้ง Schedule / ดูรายละเอียด / ขอภาพล่าสุด / ตั้งค่า ส่วน revoke อยู่ในเมนูรองพร้อมยืนยัน ไม่วางติดปุ่มตั้งงาน

Detail drawer กว้าง 480 px: ภาพล่าสุด 16:9 พร้อม timestamp → ชื่องาน/สื่อ/เวอร์ชัน → Cache readiness และความผิดปกติ → ตารางงานของจอ → ฟังก์ชันที่ Player รองรับ ปุ่มขอภาพใหม่แสดง pending และ unavailable อย่างตรงไปตรงมา

### 03 — Register Display

Modal 560 px: ขั้น 1 “เชื่อมต่อจอ” รหัส 6 หลัก → ขั้น 2 “ระบุตำแหน่ง” ชื่อ สาขา กลุ่ม → ผลลัพธ์ “จับคู่แล้ว / รอ heartbeat แรก” → CTA “ตั้งงานให้จอนี้”

รหัสผิด/หมดอายุแสดง error ติดช่องและคงข้อมูลอื่นไว้ ไม่มีข้อความสำเร็จก่อน API ยืนยัน ไม่ขอให้กรอกประเภท Player เองเมื่ออุปกรณ์รายงานได้

### 04 — Schedule composer

Step 1 เลือก Published Playlist พร้อม Preview → Step 2 เลือกชนิดเป้าหมายและจอ (ค้นหา/เลือกหลายจอ/แสดงจำนวน) → Step 3 วัน เวลา วันในสัปดาห์ และ timezone ที่แสดงชัด → Step 4 สรุปก่อน Publish

Summary ข้างแบบฟอร์ม: Playlist version, จอทั้งหมด, ช่วงเวลา, timezone, overlap warning ปุ่ม “บันทึก Draft” เป็น secondary และ “Publish” เป็น primary ช่วงข้ามคืนอธิบายวันอ้างอิงให้เห็นก่อนเผยแพร่

เมื่อเริ่มจากหน้ารายละเอียดจอ ต้องเลือกจอนั้นมาให้ก่อน ป้องกันการส่งผิดจอ วันที่สิ้นสุดก่อนวันเริ่มต้องถูกปฏิเสธพร้อม inline error

### 05 — Schedules

Table view เป็นค่าเริ่มต้นสำหรับ MVP: ชื่องาน, Playlist version, Scope/Displays, วันที่, เวลา/timezone, Draft/Published/Archived และ actions ใช้ “Published” เป็นสถานะการเผยแพร่ ไม่เท่ากับ “ทุกจอได้รับแล้ว” ปฏิทินเป็นแบบขยายภายหลัง

### 06 — Media Library

กริดภาพ/วิดีโอพร้อม filename, type, size, branch; แสดง progress จริงต่อไฟล์ ข้อผิดพลาด retry ได้ มีพื้นที่เก็บรวมและสถานะ Trash การลบสื่อที่มี references ต้องอธิบายว่างานใดใช้อยู่

### 07 — Playlist & Preview

รายการสื่อเรียงลำดับด้านซ้าย Preview 16:9 ด้านขวา ระบุ duration ของภาพและ “เล่นจนจบ” สำหรับวิดีโอ ปุ่ม Preview/Save Draft/Publish แยกกัน Published history แสดงเวลาและ version พร้อม preview เดิม

### 08 — Player pairing

จอ 1920×1080: ชื่อ StayScreen, รหัสจับคู่ขนาดใหญ่, เวลาหมดอายุ, URL ของ CMS และสถานะการรอ ยืนยันเมื่อจับคู่แล้ว ไม่แสดง credential บนจอ

## Tokens and reusable components

Colors: navigation #102039, primary #00897D, canvas #F2F5F8, surface #FFFFFF, text #18283E, text-secondary #64768B, border #DCE4EC, success #147143/#E0F6EC, warning #956200/#FFF1D6, error #9C2831/#FFE9E8

Spacing: 4, 8, 12, 16, 24, 32, 48. Radius: controls 8, panels 12, modal 16. Control height: 44 px. Icons: Lucide 20 px. ให้สร้าง variables และ reusable components ก่อนประกอบจอ: Buttons, Inputs, Selects, StatusBadge, DisplayRow, DisplayCard, ScreenshotPanel, ScheduleRow, MediaCard, Dialog, Stepper, Toast, EmptyState

## Required states / acceptance

- Loading, empty, populated, error, permission-limited สำหรับทุกหน้าจัดการ
- Pairing: invalid, expired, claimed, awaiting first heartbeat
- Displays: online+ready, online+degraded, offline+cached, revoked, screenshot pending/unavailable
- Publish: validating, saving, success, conflict warning, network failure (ห้ามปิดฟอร์มและสูญเสียข้อมูล)
- Keyboard focus มองเห็น; Dialog trap focus/ปิดด้วย Escape/คืน focus; labels อ่านด้วย screen reader
- Primary action หนึ่งตัวต่อบริบท, destructive action แยกตำแหน่ง; ขยายตัวอักษร 200% แล้วยังใช้ได้
- Screenshot มีเวลาจับภาพ ไม่ติดป้าย LIVE; Preview มีป้าย “จำลอง” พร้อมวัน/เวลา/timezone
- Figma แยก Pages: Foundations / Components / Desktop / Mobile / Prototype พร้อม Auto Layout, component instances และ prototype Register → Display detail → Schedule → Publish result

## Implementation traceability

อิงความสามารถจริงจาก web/Admin.tsx, web/Player.tsx, server/index.mjs และ shared/schedule.mjs การเพิ่ม UX เช่น stepper, overlap summary, table/card toggle เป็นงานปรับหน้าจอที่ต้องทำต่อ ไม่ควรนำไปอ้างว่าพัฒนาแล้วเพียงเพราะอยู่ในดีไซน์
