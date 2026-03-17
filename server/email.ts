import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// 발신자 이메일 주소 (Resend에서 제공하는 기본 도메인 사용)
const FROM_EMAIL = "대한한우숯불구이 <onboarding@resend.dev>";

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
  // 날짜 포맷: 2026-03-18 → 2026년 3월 18일 (화)
  const dateObj = new Date(scheduleDate + "T00:00:00+09:00");
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
  const dayName = DAY_NAMES[dateObj.getDay()];
  const [year, month, day] = scheduleDate.split("-");
  const formattedDate = `${year}년 ${parseInt(month)}월 ${parseInt(day)}일 (${dayName})`;

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
        <div style="display:flex;align-items:center;margin-bottom:12px;">
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
    console.error("[Email] Failed to send shift reminder:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Resend API 연결 테스트
 */
export async function testResendConnection(): Promise<boolean> {
  try {
    // API 키가 있는지만 확인 (실제 발송 없이)
    return !!process.env.RESEND_API_KEY;
  } catch {
    return false;
  }
}
