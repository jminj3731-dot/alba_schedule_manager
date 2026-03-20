import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// 발신자 이메일 주소 (Resend에서 제공하는 기본 도메인 사용)
const FROM_EMAIL = "대한한우숯불구이 <onboarding@resend.dev>";

/** 날짜 포맷 공통 유틸 */
function formatDate(scheduleDate: string): string {
  const dateObj = new Date(scheduleDate + "T00:00:00+09:00");
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const dayName = DAY_NAMES[dateObj.getDay()];
  const [year, month, day] = scheduleDate.split("-");
  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일 (${dayName})`;
}

/**
 * 근무 1시간 전 알림 이메일 발송
 */
export async function sendShiftReminderEmail({
  to,
  workerName,
  scheduleDate,
  timeSlot,
  startTime,
  endTime,
}: {
  to: string;
  workerName: string;
  scheduleDate: string; // YYYY-MM-DD
  timeSlot: "A" | "B" | "C";
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
}) {
  const formattedDate = formatDate(scheduleDate);
  const subject = `[대한한우숯불구이] ${workerName}님, 오늘 ${timeSlot}타임 근무 1시간 전입니다`;

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>근무 알림</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#CC0000;padding:24px 20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:bold;">대한한우숯불구이</h1>
      <p style="color:#ffcccc;margin:6px 0 0;font-size:13px;">경기도 동두천시 어수로 113-1</p>
    </div>
    
    <!-- Content -->
    <div style="padding:28px 20px;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">
        <strong style="color:#CC0000;">${workerName}</strong>님, 안녕하세요! 👋
      </p>
      <p style="font-size:15px;color:#555;margin:0 0 20px;line-height:1.6;">
        오늘 근무 시작 <strong>1시간 전</strong>입니다.<br>
        아래 일정을 확인해 주세요.
      </p>
      
      <!-- Schedule Card -->
      <div style="background-color:#fff8f8;border:2px solid #CC0000;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="margin-bottom:12px;">
          <span style="background-color:#CC0000;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:bold;">${timeSlot}타임</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;width:80px;">📅 날짜</td>
            <td style="padding:6px 0;color:#333;font-size:14px;font-weight:500;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;">⏰ 출근</td>
            <td style="padding:6px 0;color:#CC0000;font-size:16px;font-weight:bold;">${startTime}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;">🏁 퇴근</td>
            <td style="padding:6px 0;color:#333;font-size:14px;">${endTime}</td>
          </tr>
        </table>
      </div>
      
      <!-- Reminder -->
      <div style="background-color:#f0f0f0;border-radius:8px;padding:14px;margin-bottom:20px;">
        <p style="margin:0;font-size:13px;color:#666;line-height:1.6;">
          💡 <strong>출퇴근 시 GPS 인증</strong>이 필요합니다.<br>
          매장 반경 100m 이내에서 앱으로 출근 체크를 해주세요.
        </p>
      </div>
      
      <p style="font-size:13px;color:#999;margin:0;">
        오늘도 수고해 주셔서 감사합니다! 🙏
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background-color:#f5f5f5;padding:16px 20px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        이 메일은 대한한우숯불구이 알바 스케줄 시스템에서 자동 발송되었습니다.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("[Email] Failed to send 1h reminder:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 출근 시간 정각 알림 이메일 발송 ("지금 출근 버튼을 눌러주세요!")
 */
export async function sendCheckInNowEmail({
  to,
  workerName,
  scheduleDate,
  timeSlot,
  startTime,
  endTime,
}: {
  to: string;
  workerName: string;
  scheduleDate: string;
  timeSlot: "A" | "B" | "C";
  startTime: string;
  endTime: string;
}) {
  const formattedDate = formatDate(scheduleDate);
  const subject = `[대한한우숯불구이] ${workerName}님, 지금 출근 버튼을 눌러주세요! ⏰`;

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>출근 알림</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;">
    <!-- Header - 강조색 -->
    <div style="background-color:#CC0000;padding:24px 20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">⏰</div>
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:bold;">출근 시간입니다!</h1>
      <p style="color:#ffcccc;margin:6px 0 0;font-size:13px;">대한한우숯불구이</p>
    </div>
    
    <!-- 긴급 배너 -->
    <div style="background-color:#fff3cd;border-left:4px solid #ffc107;padding:14px 20px;">
      <p style="margin:0;font-size:14px;color:#856404;font-weight:bold;">
        📍 지금 매장에 도착하셨다면 앱에서 출근 버튼을 눌러주세요!
      </p>
    </div>
    
    <!-- Content -->
    <div style="padding:28px 20px;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">
        <strong style="color:#CC0000;">${workerName}</strong>님, 출근 시간이 됐습니다!
      </p>
      
      <!-- Schedule Card -->
      <div style="background-color:#fff8f8;border:2px solid #CC0000;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="margin-bottom:12px;">
          <span style="background-color:#CC0000;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:bold;">${timeSlot}타임</span>
          <span style="margin-left:8px;background-color:#28a745;color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:bold;">출근 시간</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;width:80px;">📅 날짜</td>
            <td style="padding:6px 0;color:#333;font-size:14px;font-weight:500;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;">⏰ 출근</td>
            <td style="padding:6px 0;color:#CC0000;font-size:20px;font-weight:bold;">${startTime} ← 지금!</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;">🏁 퇴근</td>
            <td style="padding:6px 0;color:#333;font-size:14px;">${endTime}</td>
          </tr>
        </table>
      </div>
      
      <!-- GPS 안내 -->
      <div style="background-color:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:14px;color:#2e7d32;font-weight:bold;">📱 출근 체크 방법</p>
        <p style="margin:0;font-size:13px;color:#388e3c;line-height:1.7;">
          1. 매장 반경 <strong>100m 이내</strong>에 위치<br>
          2. 앱 접속 → 내 스케줄 확인<br>
          3. <strong>출근 버튼</strong> 클릭
        </p>
      </div>
      
      <!-- 지각 안내 -->
      <div style="background-color:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:14px;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#e65100;line-height:1.6;">
          ⚠️ 출근 시간 이후에 버튼을 누르면 <strong>다음 30분 단위로 올림 처리</strong>됩니다.<br>
          예) 17:05 → 17:30 기록
        </p>
      </div>
      
      <p style="font-size:13px;color:#999;margin:0;">
        오늘도 파이팅입니다! 💪
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background-color:#f5f5f5;padding:16px 20px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        이 메일은 대한한우숯불구이 알바 스케줄 시스템에서 자동 발송되었습니다.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("[Email] Failed to send check-in now reminder:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 퇴근 예정 시간 알림 이메일 (알바생용: "퇴근 버튼을 눈러주세요")
 */
export async function sendCheckOutNowEmail({
  to,
  workerName,
  scheduleDate,
  timeSlot,
  startTime,
  endTime,
}: {
  to: string;
  workerName: string;
  scheduleDate: string;
  timeSlot: "A" | "B" | "C";
  startTime: string;
  endTime: string;
}) {
  const formattedDate = formatDate(scheduleDate);
  const subject = `[대한한우숙불구이] ${workerName}님, 퇴근 시간입니다! 퇴근 버튼을 눈러주세요 🏁`;

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>퇴근 알림</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#1a1a2e;padding:24px 20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🏁</div>
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:bold;">퇴근 시간입니다!</h1>
      <p style="color:#aaaacc;margin:6px 0 0;font-size:13px;">대한한우숙불구이</p>
    </div>

    <!-- 긴급 배너 -->
    <div style="background-color:#e8f4fd;border-left:4px solid #2196F3;padding:14px 20px;">
      <p style="margin:0;font-size:14px;color:#0d47a1;font-weight:bold;">
        📱 지금 앱에서 퇴근 버튼을 눈러주세요!
      </p>
    </div>

    <!-- Content -->
    <div style="padding:28px 20px;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">
        <strong style="color:#1a1a2e;">${workerName}</strong>님, 오늘 수고하셨습니다! 🙏
      </p>

      <!-- Schedule Card -->
      <div style="background-color:#f0f4ff;border:2px solid #1a1a2e;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="margin-bottom:12px;">
          <span style="background-color:#1a1a2e;color:#fff;padding:4px 10px;border-radius:20px;font-size:13px;font-weight:bold;">${timeSlot}타임</span>
          <span style="margin-left:8px;background-color:#e53935;color:#fff;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:bold;">퇴근 시간</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;width:80px;">📅 날짜</td>
            <td style="padding:6px 0;color:#333;font-size:14px;font-weight:500;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;">⏰ 출근</td>
            <td style="padding:6px 0;color:#555;font-size:14px;">${startTime}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#888;font-size:13px;">🏁 퇴근</td>
            <td style="padding:6px 0;color:#e53935;font-size:20px;font-weight:bold;">${endTime} ← 지금!</td>
          </tr>
        </table>
      </div>

      <!-- 퇴근 체크 방법 -->
      <div style="background-color:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 8px;font-size:14px;color:#2e7d32;font-weight:bold;">📱 퇴근 체크 방법</p>
        <p style="margin:0;font-size:13px;color:#388e3c;line-height:1.7;">
          1. 매장 반경 <strong>100m 이내</strong>에 위치<br>
          2. 앱 접속 → 내 스케줄 확인<br>
          3. <strong>퇴근 버튼</strong> 클릭
        </p>
      </div>

      <p style="font-size:13px;color:#999;margin:0;">
        오늘도 수고하셨습니다! 🙏
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color:#f5f5f5;padding:16px 20px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        이 메일은 대한한우숙불구이 알바 스케줄 시스템에서 자동 발송되었습니다.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("[Email] Failed to send check-out now reminder:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 관리자에게 퇴근 완료 알림 이메일
 */
export async function sendCheckOutNotifyToAdmin({
  to,
  workerName,
  scheduleDate,
  timeSlot,
  scheduledEndTime,
  actualEndTime,
}: {
  to: string;
  workerName: string;
  scheduleDate: string;
  timeSlot: "A" | "B" | "C";
  scheduledEndTime: string;
  actualEndTime: string;
}) {
  const formattedDate = formatDate(scheduleDate);
  const subject = `[대한한우숙불구이] ${workerName}님 ${timeSlot}타임 퇴근 완료`;

  const isLate = actualEndTime > scheduledEndTime;
  const isEarly = actualEndTime < scheduledEndTime;
  const statusText = isLate ? `⏰ 예정보다 늘게 퇴근 (${scheduledEndTime} → ${actualEndTime})` 
    : isEarly ? `⚡ 예정보다 일싵 퇴근 (${scheduledEndTime} → ${actualEndTime})`
    : `✅ 정시 퇴근 (${actualEndTime})`;

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>퇴근 완료 알림</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#2d3748;padding:24px 20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:bold;">퇴근 완료 알림</h1>
      <p style="color:#a0aec0;margin:6px 0 0;font-size:13px;">대한한우숙불구이 관리자</p>
    </div>

    <!-- Content -->
    <div style="padding:24px 20px;">
      <div style="background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;">
        <p style="margin:0 0 12px;font-size:16px;color:#2d3748;font-weight:bold;">
          👤 ${workerName} · ${timeSlot}타임
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#718096;font-size:13px;width:80px;">📅 날짜</td>
            <td style="padding:6px 0;color:#2d3748;font-size:14px;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#718096;font-size:13px;">🏁 예정 퇴근</td>
            <td style="padding:6px 0;color:#2d3748;font-size:14px;">${scheduledEndTime}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#718096;font-size:13px;">⏱ 실제 퇴근</td>
            <td style="padding:6px 0;color:#e53935;font-size:16px;font-weight:bold;">${actualEndTime}</td>
          </tr>
        </table>
      </div>

      <div style="background-color:${isLate ? '#fff3e0' : isEarly ? '#e3f2fd' : '#e8f5e9'};border-radius:8px;padding:12px 16px;">
        <p style="margin:0;font-size:13px;color:${isLate ? '#e65100' : isEarly ? '#1565c0' : '#2e7d32'};font-weight:500;">
          ${statusText}
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color:#f5f5f5;padding:16px 20px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:11px;color:#aaa;">
        대한한우숙불구이 알바 스케줄 시스템
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    });
    return { success: true, id: result.data?.id };
  } catch (error) {
    console.error("[Email] Failed to send check-out notify to admin:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Resend API 연결 테스트
 */
export async function testResendConnection(): Promise<boolean> {
  try {
    return !!process.env.RESEND_API_KEY;
  } catch {
    return false;
  }
}
