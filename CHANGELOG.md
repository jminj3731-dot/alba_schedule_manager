# Changelog

변경 내역은 Claude Code가 작업할 때마다 기록됩니다.
Codex 등 다른 도구와 구분하기 위해 [Claude] 커밋에 해당하는 내역만 포함합니다.

---

## 2026-04-25

### E슬롯(5번째 근무자) 추가
- `drizzle/schema.ts`: eTime* 컬럼 5개 추가
- `server/db.ts`: E슬롯 upsert/통계/시간수정 로직 추가, ensureTables에 ALTER 추가
- `server/routers.ts`: timeSlot enum에 "e" 추가
- `server/emailScheduler.ts`: E슬롯 알림 대상 포함
- `client/src/pages/Master.tsx`: UI에 E컬럼 추가, expandedESlots 상태 관리
- `client/src/pages/Home.tsx`: E슬롯 근무 표시, checkedIn/OutTime 분기 추가, correctionCtx 타입 수정
- `client/src/pages/WorkerView.tsx`: 리스트/캘린더뷰에 D·E 근무자 표시
- `client/src/pages/FullSchedule.tsx`: E슬롯 표시 및 메인 숙련자 체크 포함
- `drizzle/0016_boring_leopardon.sql`: 마이그레이션 no-op 처리 (컬럼은 ensureTables가 추가)

### 급여일 전날 푸시 알림 추가
- `server/emailScheduler.ts`: 급여일 전날 이메일 발송 시 푸시 알림도 함께 발송

---

## 2026-04-24

### PWA 앱 이름 변경
- `client/public/manifest.json`: "ALBA" → "대한한우"

### Gmail SMTP IPv6 오류 수정
- `server/email.ts`: `family: 4` 옵션 추가로 IPv4 강제

### 공지사항 푸시 알림 수정
- `server/routers.ts`: announcements.create에 sendPushToAll 연동
- `server/push.ts`: sendPushToAll 함수 중앙화
- `server/db.ts`: ensureTables로 pushSubscriptions 테이블 자동 생성
