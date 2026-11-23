# ตั้งค่าก่อนเปิดใช้จริง

ผลตรวจในเครื่อง: build ผ่าน; ทดสอบ browser ด้วยผลโมเดลจำลองผ่านสำหรับตรวจชนิด/ขนาดไฟล์, สถานะ, แก้ข้อความ, SRT และยกเลิก/ลองใหม่; ทดสอบ OAuth ด้วย Google จำลองผ่านสำหรับ state, PKCE, callback, session, tampering, logout และ provider failure สภาพแวดล้อมทดสอบเชื่อมต่อ Hugging Face เพื่อดาวน์โหลดเสียง/โมเดลไม่ได้ จึงยังไม่ได้ยืนยันการถอดเสียงจริงหรือความแม่นยำ และไม่มี credentials สำหรับ Google จริง

สถานะ: โค้ดเดิมมีเพียง modal จำลองล็อกอินและสร้าง sample.srt ไม่มีระบบถอดเสียง/API/session จริง ขณะนี้เพิ่มการถอดเสียงในเครื่องและ Google authorization-code flow แล้ว แต่ยังไม่มี credentials และไม่ทราบโดเมน Netlify ที่ใช้งานจริง จึงยังยืนยันการล็อกอินจริงไม่ได้

## Netlify

ถ้าเชื่อม repository ที่มีโฟลเดอร์ app ให้ตั้ง Base directory = app, Build command = node build.js, Publish directory = dist และใช้ app/netlify.toml ต้อง deploy ผ่าน build ที่รวม Functions ด้วย การลากเฉพาะ dist ขึ้นโฮสต์จะไม่มี OAuth backend

ไป Project configuration → Environment variables → Add a variable ตั้งสำหรับ production และ Functions (ถ้าแผนมีตัวเลือก scope) แล้ว deploy ใหม่:

| ชื่อตัวแปร | ค่าที่นำมาใส่ |
|---|---|
| SITE_URL | HTTPS origin ของเว็บจริงจาก Netlify → Domain management เช่น https://YOUR-SITE.netlify.app ไม่มี path/query หรือ slash ท้าย ห้ามคัดลอกตัวอย่างนี้ทั้งค่า |
| GOOGLE_CLIENT_ID | Google Cloud → Google Auth Platform → Clients → OAuth 2.0 Client IDs → Web application → Client ID |
| GOOGLE_CLIENT_SECRET | Client Secret จาก client เดียวกัน ตั้งเป็น secret ฝั่ง Functions เท่านั้น |
| SESSION_SECRET | สุ่มเองอย่างน้อย 32 ไบต์ ใช้ `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` เก็บเป็น secret ไม่ใช่ค่าจาก Google |

ไม่ใช้ VITE_/PUBLIC_ prefix และไม่ใส่ secret ลงหน้าเว็บ, build output, .env ที่ commit หรือ repository ไม่มี API key ที่ต้องซื้อสำหรับการถอดเสียง

## Google Cloud Console

1. Google Auth Platform → Branding: ตั้งชื่อแอป, support email, authorized domains และลิงก์ privacy/terms ที่เป็นเว็บจริง
2. Audience: เลือกชนิดผู้ใช้ให้ถูก ถ้า External และ Testing ให้เพิ่มอีเมลทดสอบใน Test users ก่อนใช้; เปิด Production เมื่อพร้อมตามข้อกำหนด Google
3. Data Access: ใช้เฉพาะ openid, email, profile
4. Clients → Create client → Web application: Authorized JavaScript origins = ค่า SITE_URL ตรงกันทุกตัว (ไม่มี path)
5. Authorized redirect URIs = SITE_URL ต่อด้วย `/.netlify/functions/auth/callback` เช่น `https://YOUR-SITE.netlify.app/.netlify/functions/auth/callback`
6. ไม่ใช้ wildcard และไม่ใช้โดเมน preview เป็น production callback หากใช้ custom domain ต้องลงทะเบียน custom origin/callback และตั้ง SITE_URL เป็นโดเมนเดียวกัน พร้อม redirect โดเมนรองมาที่โดเมนหลัก

โค้ดใช้ server-side redirect ไม่ใช้ Google JavaScript SDK แต่ใส่ origin ให้ตรงกับเว็บไว้ได้ เปิด `/.netlify/functions/auth/session` บนเว็บจริงเพื่อดู missing, origin และ callback ที่โค้ดใช้ (ไม่มี secret)

## สิ่งที่ใช้ฟรีและข้อจำกัด

- Google Fonts (Kanit/Mali/Itim) เป็นฟอนต์โอเพนซอร์สใช้เชิงพาณิชย์ได้ตาม https://developers.google.com/fonts ไม่มีค่าเรียก API; LINE/Facebook เป็นลิงก์ติดต่อ ไม่ใช่ SDK หรือการส่งข้อมูลเบื้องหลัง; get-npm.cjs เป็นสคริปต์เตรียมเครื่องเดิม ไม่ได้อยู่ใน build/runtime
- ทดสอบเพิ่มแล้ว: decode วิดีโอ WebM จริงใน browser โดยใช้ผลโมเดลจำลอง, export VTT และแจ้งข้อผิดพลาดเมื่อโมเดลโหลดล้มเหลวผ่านทั้งหมด

- การถอดเสียงใช้ Transformers.js 2.17.2 (Apache-2.0), Xenova/whisper-tiny (Apache-2.0) และ ONNX Runtime Web ที่มากับไลบรารี (MIT) ดาวน์โหลดจาก jsDelivr/Hugging Face; ไม่ใช้ paid inference API, Groq, ElevenLabs, Slip2Go, analytics หรือ payment SDK การฝังซับโหลด @ffmpeg/core 0.12.10 จาก jsDelivr เมื่อเริ่มส่งออก และใช้ฟอนต์ Noto ที่มากับเว็บ ไม่มีแพ็กเกจ production ติดตั้งใหม่ ตัว build ใช้ Node built-ins; verify.cjs ใช้ Playwright ที่เครื่องมีอยู่ (Apache-2.0, เฉพาะทดสอบ)
- ถอดเสียงไทย/อังกฤษ แก้ข้อความ และ export SRT/VTT ฟรี ไม่มีบัญชีหรือ API key; ฝังซับลง MP4 ในเครื่องหลังถอดเสียงหรือเพิ่มคำบรรยายและเวลาเองได้ ไม่แปลภาษา ไม่เก็บ cloud library และปิดการชำระเงิน/affiliate หน้าแพ็กเกจเดิมเป็นข้อมูลตัวอย่าง ไม่ใช่สิทธิที่ซื้อได้
- ไฟล์ไม่ส่งออกจากเครื่อง ประมวลผล PCM ทีละประมาณ 25 วินาทีผ่าน Web Audio และ Web Worker โมเดลใช้หน่วยความจำเพิ่มและครั้งแรกดาวน์โหลดไฟล์ขนาดใหญ่ ใช้ Chrome/Edge รุ่นปัจจุบันและเปิดแท็บไว้ การประมวลผลใช้เวลาคลิปบวก inference ไทยอาจคลาดเคลื่อน ต้องตรวจข้อความ/เวลาเอง
- ตรวจ 400 MB = 400,000,000 ไบต์ก่อนสร้าง object URL ไม่ส่งไฟล์เข้า Netlify Functions จึงไม่ติดเพดาน request ~4.5 MB แบบ binary; นี่คือการเลือกไฟล์ในเครื่อง ไม่ใช่บริการอัปโหลด 400 MB ขึ้น cloud ยังไม่ได้ยืนยัน end-to-end กับวิดีโอจริง 400 MB และไม่รับประกันทุก codec/อุปกรณ์
- Netlify hosting/Functions มีโควตาแผนฟรี ใช้ Free plan และไม่เปิด auto recharge/บริการเสียเงิน ตรวจ Billing ของบัญชีเอง เมื่อโควตาหมดเว็บอาจหยุดให้บริการ Google OAuth ไม่มีการเรียก API คิดเงินในโค้ดนี้
- ดาวน์โหลดโมเดล/CDN ต้องใช้อินเทอร์เน็ตและขึ้นกับ availability/rate limits ของผู้ให้บริการ ผู้ให้บริการเห็น IP ของคำขอดาวน์โหลด ไม่มีเสียงถูกส่งไปประมวลผล
- session ใช้ signed HttpOnly Secure SameSite cookie อายุ 24 ชั่วโมง, OAuth state และ PKCE อายุ 10 นาที; token Google ไม่เก็บใน browser ออกจากระบบล้าง session ของเว็บ ไม่ได้ออกจากบัญชี Google ทั้งเครื่อง

## ทดสอบหลังตั้งค่า

1. เปิด session endpoint: missing ต้องว่าง ตรวจ callback ตรง Google Console
2. กด Google → ยินยอม → กลับหน้าแรกเห็นชื่อบัญชี → reload แล้วยังเข้าสู่ระบบ → ออกจากระบบ → reload ไม่เห็นบัญชี
3. ทดสอบยกเลิก consent, callback state ผิด/หมดอายุ, secret ผิด และ endpoint ใช้งานไม่ได้ ต้องมีข้อความเข้าใจง่าย
4. เลือกเสียงพูด WAV/MP3 และวิดีโอ MP4 ที่มีเสียงจริง เริ่มถอดเสียง ดูสถานะ แก้ข้อความ ดาวน์โหลด SRT/VTT ตรวจเวลาและข้อความ ทดสอบยกเลิก/ลองใหม่, ไฟล์ไม่มีเสียง, codec ไม่รองรับ, ออฟไลน์ และไฟล์ >400 MB
5. การทดสอบจำลอง OAuth ไม่ทดแทนทดสอบ Google จริง ห้ามประกาศเปิดใช้งานสำเร็จก่อนทำข้อ 1–4 กับ credentials/โดเมนจริง

แหล่งตรวจสอบใบอนุญาต/ข้อจำกัด:
- https://github.com/huggingface/transformers.js/blob/main/LICENSE
- https://huggingface.co/Xenova/whisper-tiny
- https://github.com/microsoft/onnxruntime/blob/main/LICENSE
- https://huggingface.co/docs/transformers.js/v2.17.2/pipelines
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://docs.netlify.com/build/functions/configuration/
- https://www.netlify.com/pricing/
