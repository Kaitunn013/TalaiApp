# TalaiApp

TalaiApp เป็นแอปพลิเคชันมือถือสำหรับติดตามรถโดยสารรับส่งภายในมหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตกำแพงแสน โดยแสดงเส้นทางรถ ตำแหน่งรถ จุดจอด และเวลาประมาณการที่รถจะมาถึงแบบ Real-time เพื่อช่วยให้นิสิตและบุคลากรวางแผนการเดินทางภายในมหาวิทยาลัยได้สะดวกขึ้น

## ฟีเจอร์หลัก

- แสดงตำแหน่งรถโดยสารบนแผนที่แบบ Real-time
- เลือกและสลับระหว่างสายรถโดยสารต่าง ๆ
- แสดงเส้นทาง ลำดับจุดจอด ชื่อจุดจอด และตำแหน่งของแต่ละจุด
- แสดงสถานะรถ เช่น Active และ Inactive
- แสดงเวลาประมาณการที่รถจะมาถึงจุดจอดถัดไป
- รองรับการเลือกดูรถแต่ละคันเมื่อมีรถหลายคันในเส้นทางเดียวกัน
- แสดงรายละเอียดเส้นทางและจุดจอดผ่าน Bottom Sheet
- เชื่อมต่อ WebSocket ใหม่โดยอัตโนมัติเมื่อการเชื่อมต่อขัดข้อง

## การทำงานของระบบ

1. แอปโหลดข้อมูลเส้นทางและตำแหน่งรถล่าสุดผ่าน REST API
2. แอปเชื่อมต่อกับ WebSocket สำหรับรับข้อมูลตำแหน่งรถแบบ Real-time โดยใช้ Mobile Token
3. ข้อมูลตำแหน่งรถที่ได้รับจะถูกแปลงให้อยู่ในรูปแบบมาตรฐานและแสดงบนแผนที่
4. เส้นทางที่เลือกและลำดับจุดจอดจะอัปเดตพร้อมเวลาประมาณการแบบ Real-time

## เทคโนโลยีที่ใช้

- React Native
- Expo SDK 54
- TypeScript
- Expo Router
- React Navigation
- React Native Maps
- Expo Location
- WebSocket
- REST API
- รองรับ Android, iOS และ Web ผ่าน Expo

## โครงสร้างโปรเจค

```text
TalaiApp/
├── app/                         # จุดเริ่มต้นของ Expo Router
├── src/
│   ├── component/
│   │   ├── RoutesBottomSheet.tsx
│   │   └── SplashScreen.tsx
│   ├── hooks/
│   │   └── useCarLocation.ts    # โหลดตำแหน่งรถและรับข้อมูลแบบ Real-time
│   ├── services/
│   │   └── talaiApi.ts          # เชื่อมต่อ REST API และแปลงข้อมูล
│   ├── utils/
│   │   └── localStopProgress.ts # คำนวณจุดจอดและเวลาโดยประมาณ
│   └── HomeScreen.tsx            # หน้าหลักและแผนที่
├── App.tsx
└── package.json
```

## วิธีติดตั้งและใช้งาน

### สิ่งที่ต้องติดตั้ง

- Node.js และ npm
- Android Studio พร้อม Emulator หรือ iOS Simulator
- Expo Go สำหรับทดสอบบนอุปกรณ์มือถือ
- สิทธิ์เข้าถึง Backend API และ WebSocket ของระบบ Talai

### ติดตั้งโปรเจค

```bash
git clone https://github.com/Kaitunn013/TalaiApp.git
cd TalaiApp
npm install
```

สร้างไฟล์ `.env.local` ไว้ที่ root ของโปรเจค:

```env
EXPO_PUBLIC_API_URL=https://api.talai-kukps.app
EXPO_PUBLIC_WS_URL=wss://api.talai-kukps.app
EXPO_PUBLIC_MOBILE_TOKEN=your_mobile_token
```

เริ่มต้น Development Server:

```bash
npx expo start
```

คำสั่งอื่นที่ใช้ได้:

```bash
npm run android
npm run ios
npm run web
npm run lint
```

## API ที่แอปใช้งาน

แอปมือถือเชื่อมต่อกับ Backend ผ่าน API ดังต่อไปนี้:

- `GET /routes` — โหลดข้อมูลสายรถโดยสาร
- `GET /route-points/by-route/:routeId` — โหลดข้อมูลจุดจอดตามเส้นทาง
- `GET /cars` — โหลดข้อมูลรถโดยสาร
- `GET /cars/live-positions` — โหลดตำแหน่งรถล่าสุด
- `WebSocket` — รับข้อมูลตำแหน่งรถแบบ Real-time

ทุก Request จะส่ง Header `x-mobile-token` เพื่อยืนยันสิทธิ์ของ Mobile Client

## Repository ที่เกี่ยวข้อง

- [Talai Admin Web](https://github.com/THEkingmay/kukps-talai-web) — เว็บไซต์สำหรับผู้ดูแลระบบ ใช้จัดการข้อมูลรถและเส้นทาง
- [Talai Backend](https://github.com/THEkingmay/talai-kukps-backend) — Backend API และบริการส่งข้อมูลตำแหน่งรถแบบ Real-time

## หมายเหตุด้านความปลอดภัย

ไม่ควร Commit ไฟล์ `.env.local`, Mobile Token หรือข้อมูลรับรองอื่น ๆ ลงใน Repository ควรใช้ Environment Variables สำหรับการตั้งค่าในแต่ละสภาพแวดล้อม