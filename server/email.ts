const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const FROM_NAME = "대한한우숯불구이";
const FROM_EMAIL_ADDR = process.env.BREVO_FROM_EMAIL || "jminj3731@gmail.com";
const FROM_EMAIL = `${FROM_NAME} <${FROM_EMAIL_ADDR}>`;

async function sendBrevoEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<{ messageId?: string }> {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL_ADDR },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Brevo API error ${response.status}: ${err}`);
  }
  const data = await response.json() as any;
  return { messageId: data.messageId };
}

/** 날짜 포맷 공통 유틸 - KST 기준 요일 계산 */
function formatDate(scheduleDate: string): string {
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  // scheduleDate는 YYYY-MM-DD 형식 (KST 날짜)
  // 날짜 문자열을 직접 파싱하여 요일 계산 (서버 타임존 영향 없음)
  const [year, month, day] = scheduleDate.split("-").map(Number);
  // new Date(y, m-1, d)는 로컈 시간 기준이지만, 서버가 UTC이면 날짜가 바뀌지 않음
  // UTC 기준으로 직접 요일 계산: UTC 자정으로 생성 후 getUTCDay() 사용
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  const dayName = DAY_NAMES[dateObj.getUTCDay()];
  return `${year}년 ${month}월 ${day}일 (${dayName})`;
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
    const result = await sendBrevoEmail({
      to,
      subject,
      html,
    });
    return { success: true, id: result.messageId };
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
    const result = await sendBrevoEmail({
      to,
      subject,
      html,
    });
    return { success: true, id: result.messageId };
  } catch (error) {
    console.error("[Email] Failed to send check-in now reminder:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 퇴근 예정 시간 알림 이메일 (알바생용: "퇴근 버튼을 눌러주세요")
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
  const subject = `[대한한우숯불구이] ${workerName}님, 퇴근 시간입니다! 퇴근 버튼을 눌러주세요 🏁`;

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
      <p style="color:#aaaacc;margin:6px 0 0;font-size:13px;">대한한우숯불구이</p>
    </div>

    <!-- 긴급 배너 -->
    <div style="background-color:#e8f4fd;border-left:4px solid #2196F3;padding:14px 20px;">
      <p style="margin:0;font-size:14px;color:#0d47a1;font-weight:bold;">
        📱 지금 앱에서 퇴근 버튼을 눌러주세요!
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
        이 메일은 대한한우숯불구이 알바 스케줄 시스템에서 자동 발송되었습니다.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await sendBrevoEmail({
      to,
      subject,
      html,
    });
    return { success: true, id: result.messageId };
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
  const subject = `[대한한우숯불구이] ${workerName}님 ${timeSlot}타임 퇴근 완료`;

  const isLate = actualEndTime > scheduledEndTime;
  const isEarly = actualEndTime < scheduledEndTime;
  const statusText = isLate ? `⏰ 예정보다 늦게 퇴근 (${scheduledEndTime} → ${actualEndTime})`
    : isEarly ? `⚡ 예정보다 일찍 퇴근 (${scheduledEndTime} → ${actualEndTime})`
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
      <p style="color:#a0aec0;margin:6px 0 0;font-size:13px;">대한한우숯불구이 관리자</p>
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
        대한한우숯불구이 알바 스케줄 시스템
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const result = await sendBrevoEmail({
      to,
      subject,
      html,
    });
    return { success: true, id: result.messageId };
  } catch (error) {
    console.error("[Email] Failed to send check-out notify to admin:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 관리자에게 출퇴근 시간 수정 알림 이메일
 */
export async function sendAttendanceCorrectionToAdmin({
  to,
  workerName,
  scheduleDate,
  timeSlot,
  correctionType,
  originalCheckInTime,
  correctedCheckInTime,
  originalCheckOutTime,
  correctedCheckOutTime,
  reason,
}: {
  to: string;
  workerName: string;
  scheduleDate: string;
  timeSlot: string;
  correctionType: "check_in" | "check_out" | "both";
  originalCheckInTime?: string;
  correctedCheckInTime?: string;
  originalCheckOutTime?: string;
  correctedCheckOutTime?: string;
  reason: string;
}) {
  const formattedDate = formatDate(scheduleDate);
  const subject = `[대한한우숯불구이] ${workerName}님 출퇴근 시간 수정 알림`;

  const checkInRow = (correctionType === "check_in" || correctionType === "both") ? `
    <tr>
      <td style="padding:6px 0;color:#718096;font-size:13px;width:80px;">📥 출근</td>
      <td style="padding:6px 0;color:#2d3748;font-size:14px;">
        <span style="text-decoration:line-through;color:#aaa;">${originalCheckInTime || "-"}</span>
        <span style="margin:0 6px;color:#888;">→</span>
        <strong style="color:#CC0000;">${correctedCheckInTime || "-"}</strong>
      </td>
    </tr>` : "";

  const checkOutRow = (correctionType === "check_out" || correctionType === "both") ? `
    <tr>
      <td style="padding:6px 0;color:#718096;font-size:13px;width:80px;">📤 퇴근</td>
      <td style="padding:6px 0;color:#2d3748;font-size:14px;">
        <span style="text-decoration:line-through;color:#aaa;">${originalCheckOutTime || "-"}</span>
        <span style="margin:0 6px;color:#888;">→</span>
        <strong style="color:#CC0000;">${correctedCheckOutTime || "-"}</strong>
      </td>
    </tr>` : "";

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;">
    <div style="background-color:#2d3748;padding:24px 20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:18px;font-weight:bold;">출퇴근 시간 수정 알림</h1>
      <p style="color:#a0aec0;margin:6px 0 0;font-size:13px;">대한한우숯불구이 관리자</p>
    </div>
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
          ${checkInRow}
          ${checkOutRow}
        </table>
      </div>
      <div style="background-color:#fff8f0;border:1px solid #fbd38d;border-radius:8px;padding:14px 16px;">
        <p style="margin:0 0 4px;font-size:12px;color:#744210;font-weight:bold;">📝 수정 사유</p>
        <p style="margin:0;font-size:14px;color:#744210;">${reason}</p>
      </div>
    </div>
    <div style="background-color:#f5f5f5;padding:16px 20px;text-align:center;border-top:1px solid #eee;">
      <p style="margin:0;font-size:11px;color:#aaa;">대한한우숯불구이 알바 스케줄 시스템</p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const result = await sendBrevoEmail({
      to,
      subject,
      html,
    });
    return { success: true, id: result.messageId };
  } catch (error) {
    console.error("[Email] Failed to send correction notify to admin:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * 급여일 전날 급여 내역 이메일 발송
 */
export async function sendPaydayEveEmail({
  to,
  workerName,
  payDay,
  periodStart,
  periodEnd,
  workDays,
  totalMinutes,
  hourlyWage,
  totalPay,
  breakdown,
}: {
  to: string;
  workerName: string;
  payDay: number;
  periodStart: string;
  periodEnd: string;
  workDays: number;
  totalMinutes: number;
  hourlyWage: number;
  totalPay: number;
  breakdown: { date: string; dayOfWeek: string; timeSlot: string; startTime: string; endTime: string; minutes: number }[];
}) {
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
  const subject = `[대한한우숯불구이] ${workerName}님, 내일 급여일입니다 🎉 이번 달 급여 내역 안내`;

  const breakdownRows = breakdown.map((d) => {
    const h = Math.floor(d.minutes / 60);
    const m = d.minutes % 60;
    const timeStr = m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
    return `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:8px 6px;font-size:12px;color:#555;">${d.date.slice(5).replace("-", "/")}</td>
        <td style="padding:8px 6px;font-size:12px;color:#555;text-align:center;">${d.dayOfWeek}</td>
        <td style="padding:8px 6px;font-size:12px;color:#555;text-align:center;">${d.timeSlot}타임</td>
        <td style="padding:8px 6px;font-size:12px;color:#555;text-align:center;">${d.startTime}~${d.endTime}</td>
        <td style="padding:8px 6px;font-size:12px;color:#333;font-weight:500;text-align:right;">${timeStr}</td>
      </tr>`;
  }).join("");

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background-color:#ffffff;">
    <!-- Header -->
    <div style="background-color:#CC0000;padding:28px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">💰</div>
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:bold;">이번 달 수고 많으셨어요!</h1>
      <p style="color:#ffcccc;margin:8px 0 0;font-size:14px;">내일(${payDay}일) 급여가 지급됩니다</p>
    </div>

    <!-- 인사말 -->
    <div style="padding:24px 24px 0;">
      <p style="font-size:16px;color:#333;margin:0 0 4px;">
        <strong style="color:#CC0000;">${workerName}</strong>님, 안녕하세요! 👋
      </p>
      <p style="font-size:14px;color:#666;margin:0;line-height:1.6;">
        이번 달 근무 기간(<strong>${periodStart} ~ ${periodEnd}</strong>)의 급여 내역을 알려드립니다.
      </p>
    </div>

    <!-- 핵심 수치 -->
    <div style="padding:20px 24px;">
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <div style="flex:1;text-align:center;padding:16px 8px;background-color:#f8f8f8;border-radius:12px;">
          <p style="margin:0 0 4px;font-size:11px;color:#888;">근무일수</p>
          <p style="margin:0;font-size:24px;font-weight:bold;color:#333;">${workDays}</p>
          <p style="margin:0;font-size:11px;color:#888;">일</p>
        </div>
        <div style="flex:1;text-align:center;padding:16px 8px;background-color:#f8f8f8;border-radius:12px;">
          <p style="margin:0 0 4px;font-size:11px;color:#888;">총 근무시간</p>
          <p style="margin:0;font-size:24px;font-weight:bold;color:#333;">${totalHours}</p>
          <p style="margin:0;font-size:11px;color:#888;">시간</p>
        </div>
        <div style="flex:1;text-align:center;padding:16px 8px;background-color:#f8f8f8;border-radius:12px;">
          <p style="margin:0 0 4px;font-size:11px;color:#888;">시급</p>
          <p style="margin:0;font-size:20px;font-weight:bold;color:#333;">${hourlyWage.toLocaleString()}</p>
          <p style="margin:0;font-size:11px;color:#888;">원</p>
        </div>
      </div>

      <!-- 총 급여 강조 -->
      <div style="background-color:#fff8f0;border:2px solid #CC0000;border-radius:14px;padding:20px;text-align:center;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:13px;color:#888;">이번 달 예상 총 급여</p>
        <p style="margin:0;font-size:32px;font-weight:bold;color:#CC0000;">${totalPay.toLocaleString()}원</p>
        <p style="margin:6px 0 0;font-size:12px;color:#aaa;">${totalHours}h × ${hourlyWage.toLocaleString()}원</p>
      </div>

      <!-- 근무 상세 내역 -->
      ${breakdown.length > 0 ? `
      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden;">
        <div style="background-color:#f5f5f5;padding:10px 16px;">
          <p style="margin:0;font-size:13px;font-weight:bold;color:#333;">📋 근무 상세 내역</p>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background-color:#fafafa;">
              <th style="padding:8px 6px;font-size:11px;color:#888;font-weight:500;text-align:left;">날짜</th>
              <th style="padding:8px 6px;font-size:11px;color:#888;font-weight:500;text-align:center;">요일</th>
              <th style="padding:8px 6px;font-size:11px;color:#888;font-weight:500;text-align:center;">타임</th>
              <th style="padding:8px 6px;font-size:11px;color:#888;font-weight:500;text-align:center;">시간대</th>
              <th style="padding:8px 6px;font-size:11px;color:#888;font-weight:500;text-align:right;">근무시간</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownRows}
          </tbody>
        </table>
      </div>
      ` : '<p style="text-align:center;color:#aaa;font-size:13px;">이번 기간 근무 기록이 없습니다.</p>'}
    </div>

    <!-- 푸터 메시지 -->
    <div style="padding:0 24px 24px;">
      <p style="font-size:13px;color:#999;margin:0;text-align:center;line-height:1.8;">
        이번 달도 정말 수고 많으셨습니다! 💪<br>
        급여 관련 문의는 사장님께 연락해 주세요.
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
</html>`.trim();

  try {
    const result = await sendBrevoEmail({
      to,
      subject,
      html,
    });
    return { success: true, id: result.messageId };
  } catch (error) {
    console.error("[Email] Failed to send payday eve email:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Gmail SMTP 연결 테스트
 */
export async function testResendConnection(): Promise<boolean> {
  try {
    return !!process.env.BREVO_API_KEY;
  } catch {
    return false;
  }
}

/**
 * 알림 테스트 이메일 발송
 */
export async function sendTestEmail({
  to,
  workerName,
}: {
  to: string;
  workerName: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await sendBrevoEmail({
      to,
      subject: "[대한한우숯불구이] 알림 테스트 이메일",
      html: `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;">
    <div style="background-color:#CC0000;padding:24px 20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:bold;">대한한우숯불구이</h1>
      <p style="color:#ffcccc;margin:6px 0 0;font-size:13px;">경기도 동두천시 어수로 113-1</p>
    </div>
    <div style="padding:28px 20px;">
      <p style="font-size:16px;color:#333;margin:0 0 16px;">
        <strong style="color:#CC0000;">${workerName}</strong>님, 안녕하세요! 👋
      </p>
      <p style="font-size:15px;color:#555;margin:0 0 20px;line-height:1.6;">
        이메일 알림이 <strong>정상 작동</strong>합니다.<br>
        이 메일은 알림 테스트용으로 발송된 메일입니다.
      </p>
      <div style="background-color:#fff8f8;border:2px solid #CC0000;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;font-size:14px;color:#CC0000;font-weight:bold;">✅ 이메일 알림 정상</p>
      </div>
    </div>
  </div>
</body>
</html>
      `,
    });
    console.log("[Email] Test email sent:", result.messageId);
    return { success: true };
  } catch (error) {
    console.error("[Email] Failed to send test email:", error);
    return { success: false, error: String(error) };
  }
}
