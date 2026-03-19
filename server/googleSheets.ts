/**
 * 구글 시트 내보내기 모듈
 * 알바생 정보, 스케줄, 출퇴근 기록, 급여 계산 데이터를 구글 시트에 업데이트
 */
import { google } from "googleapis";
import { getAllWorkers, getSchedulesByDateRange, getStatsByDateRange } from "./db";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

// 시트 탭 이름
const SHEETS = {
  WORKERS: "알바생 목록",
  SCHEDULES: "스케줄",
  ATTENDANCE: "출퇴근 기록",
  SALARY: "급여 계산",
};

/** 구글 Sheets API 클라이언트 생성 */
function getSheetsClient() {
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY || !SHEET_ID) {
    throw new Error("Google Sheets 환경변수가 설정되지 않았습니다 (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID)");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

/** 시트 탭이 없으면 생성, 있으면 기존 탭 ID 반환 */
async function ensureSheetTab(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string
): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(
    (s) => s.properties?.title === tabName
  );

  if (existing?.properties?.sheetId !== undefined && existing.properties.sheetId !== null) {
    return existing.properties.sheetId as number;
  }

  // 탭 생성
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: tabName } } }],
    },
  });
  const newSheetId: number = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  return newSheetId;
}

/** 특정 탭의 모든 데이터를 지우고 새 데이터로 덮어쓰기 */
async function overwriteSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  tabName: string,
  data: (string | number | null)[][]
) {
  // 기존 내용 전체 삭제
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabName}!A:ZZ`,
  });

  if (data.length === 0) return;

  // 새 데이터 쓰기
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: data },
  });
}

/** 헤더 행 굵게 처리 */
async function boldHeader(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetId: number,
  colCount: number
) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: colCount,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
              },
            },
            fields: "userEnteredFormat(textFormat,backgroundColor)",
          },
        },
      ],
    },
  });
}

/** 날짜 범위 계산: 최근 3개월 */
function getDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    .toISOString()
    .split("T")[0];
  return { startDate: start, endDate: end };
}

/** 분 → "HH:MM" 변환 */
function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}시간 ${m > 0 ? m + "분" : ""}`.trim();
}

/**
 * 전체 데이터를 구글 시트에 내보내기
 * 탭 구성: 알바생 목록 / 스케줄 / 출퇴근 기록 / 급여 계산
 */
export async function exportToGoogleSheets(): Promise<{
  success: boolean;
  message: string;
  sheetUrl?: string;
}> {
  try {
    const sheets = getSheetsClient();
    const spreadsheetId = SHEET_ID!;
    const { startDate, endDate } = getDateRange();

    // 데이터 조회
    const [workers, schedules] = await Promise.all([
      getAllWorkers(),
      getSchedulesByDateRange(startDate, endDate),
    ]);

    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

    // ── 1. 알바생 목록 탭 ──
    await ensureSheetTab(sheets, spreadsheetId, SHEETS.WORKERS);
    const workerSheetId = await ensureSheetTab(sheets, spreadsheetId, SHEETS.WORKERS);
    const workerRows: (string | number | null)[][] = [
      ["ID", "이름", "구분", "고정 휴무", "선호 근무일", "급여일", "이메일", "활성"],
      ...workers.map((w) => [
        w.id,
        w.name,
        w.skillLevel === "main" ? "메인" : "서브",
        w.fixedDaysOff || "-",
        w.preferredDays || "-",
        w.payDay ?? 14,
        w.email || "-",
        w.isActive ? "활성" : "비활성",
      ]),
      [],
      [`마지막 업데이트: ${now}`],
    ];
    await overwriteSheet(sheets, spreadsheetId, SHEETS.WORKERS, workerRows);
    await boldHeader(sheets, spreadsheetId, workerSheetId, 8);

    // ── 2. 스케줄 탭 ──
    const scheduleSheetId = await ensureSheetTab(sheets, spreadsheetId, SHEETS.SCHEDULES);
    const workerMap = new Map(workers.map((w) => [w.id, w.name]));
    const scheduleRows: (string | number | null)[][] = [
      ["날짜", "요일", "운영여부", "A타임 담당", "A타임 출근", "A타임 퇴근", "B타임 담당", "B타임 출근", "B타임 퇴근", "C타임 담당", "C타임 출근", "C타임 퇴근"],
      ...schedules.map((s) => [
        s.scheduleDate,
        s.dayOfWeek,
        s.isOperating ? "운영" : "휴무",
        s.aTimeWorkerId ? (workerMap.get(s.aTimeWorkerId) ?? "-") : "-",
        s.aTimeStartTime || "-",
        s.aTimeEndTime || "-",
        s.bTimeWorkerId ? (workerMap.get(s.bTimeWorkerId) ?? "-") : "-",
        s.bTimeStartTime || "-",
        s.bTimeEndTime || "-",
        s.cTimeWorkerId ? (workerMap.get(s.cTimeWorkerId) ?? "-") : "-",
        s.cTimeStartTime || "-",
        s.cTimeEndTime || "-",
      ]),
      [],
      [`마지막 업데이트: ${now}`],
    ];
    await overwriteSheet(sheets, spreadsheetId, SHEETS.SCHEDULES, scheduleRows);
    await boldHeader(sheets, spreadsheetId, scheduleSheetId, 12);

    // ── 3. 출퇴근 기록 탭 ──
    const attendanceSheetId = await ensureSheetTab(sheets, spreadsheetId, SHEETS.ATTENDANCE);
    const attendanceRows: (string | number | null)[][] = [
      ["날짜", "요일", "타임", "이름", "예정 출근", "실제 출근", "예정 퇴근", "실제 퇴근", "근무시간(시간)"],
    ];

    for (const s of schedules) {
      if (!s.isOperating) continue;

      const slots: Array<{
        slot: string;
        workerId: number | null;
        start: string | null;
        end: string | null;
        actualStart: string | null;
        actualEnd: string | null;
      }> = [
        { slot: "A", workerId: s.aTimeWorkerId, start: s.aTimeStartTime, end: s.aTimeEndTime, actualStart: s.aTimeActualStartTime, actualEnd: s.aTimeActualEndTime },
        { slot: "B", workerId: s.bTimeWorkerId, start: s.bTimeStartTime, end: s.bTimeEndTime, actualStart: s.bTimeActualStartTime, actualEnd: s.bTimeActualEndTime },
        { slot: "C", workerId: s.cTimeWorkerId, start: s.cTimeStartTime, end: s.cTimeEndTime, actualStart: s.cTimeActualStartTime, actualEnd: s.cTimeActualEndTime },
      ];

      for (const slot of slots) {
        if (!slot.workerId) continue;
        const workerName = workerMap.get(slot.workerId) ?? "알 수 없음";

        // 근무 시간 계산 (실제 출퇴근 기준, 없으면 예정 기준)
        let workHours: number | string = "-";
        const startStr = slot.actualStart || slot.start;
        const endStr = slot.actualEnd || slot.end;
        if (startStr && endStr) {
          const [sh, sm] = startStr.split(":").map(Number);
          const [eh, em] = endStr.split(":").map(Number);
          const totalMin = (eh * 60 + em) - (sh * 60 + sm);
          if (totalMin > 0) {
            workHours = Math.round((totalMin / 60) * 100) / 100; // 소수점 2자리
          }
        }

        attendanceRows.push([
          s.scheduleDate,
          s.dayOfWeek,
          `${slot.slot}타임`,
          workerName,
          slot.start || "-",
          slot.actualStart || "-",
          slot.end || "-",
          slot.actualEnd || "-",
          workHours,
        ]);
      }
    }
    attendanceRows.push([], [`마지막 업데이트: ${now}`]);
    await overwriteSheet(sheets, spreadsheetId, SHEETS.ATTENDANCE, attendanceRows);
    await boldHeader(sheets, spreadsheetId, attendanceSheetId, 9);

    // ── 4. 급여 계산 탭 ──
    const salarySheetId = await ensureSheetTab(sheets, spreadsheetId, SHEETS.SALARY);

    // 알바생별 총 근무시간 집계
    const workerHours: Map<number, { name: string; totalHours: number; workDays: number }> = new Map();
    for (const s of schedules) {
      if (!s.isOperating) continue;
      const slots = [
        { workerId: s.aTimeWorkerId, start: s.aTimeActualStartTime || s.aTimeStartTime, end: s.aTimeActualEndTime || s.aTimeEndTime },
        { workerId: s.bTimeWorkerId, start: s.bTimeActualStartTime || s.bTimeStartTime, end: s.bTimeActualEndTime || s.bTimeEndTime },
        { workerId: s.cTimeWorkerId, start: s.cTimeActualStartTime || s.cTimeStartTime, end: s.cTimeActualEndTime || s.cTimeEndTime },
      ];
      for (const slot of slots) {
        if (!slot.workerId || !slot.start || !slot.end) continue;
        const [sh, sm] = slot.start.split(":").map(Number);
        const [eh, em] = slot.end.split(":").map(Number);
        const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        if (hours <= 0) continue;
        const existing = workerHours.get(slot.workerId) || { name: workerMap.get(slot.workerId) ?? "알 수 없음", totalHours: 0, workDays: 0 };
        existing.totalHours += hours;
        existing.workDays += 1;
        workerHours.set(slot.workerId, existing);
      }
    }

    const HOURLY_RATE = 10030; // 2024년 최저시급

    // 급여 행 수식 (행 번호 정확히 계산: 헤더 1행 + 데이터 idx)
    const salaryDataRows = Array.from(workerHours.entries()).map(([, v], idx) => {
      const rowNum = idx + 2; // 1행은 헤더
      return [
        v.name,
        `${startDate} ~ ${endDate}`,
        v.workDays,
        Math.round(v.totalHours * 100) / 100,
        HOURLY_RATE,
        `=D${rowNum}*E${rowNum}`,
      ];
    });

    const finalSalaryRows: (string | number | null)[][] = [
      ["이름", "근무 기간", "총 근무일수", "총 근무시간(h)", "시급 (원)", "예상 급여 (원)"],
      ...salaryDataRows,
      [],
      [`기간: ${startDate} ~ ${endDate}`],
      [`※ 시급은 2024년 최저시급(${HOURLY_RATE.toLocaleString()}원) 기준. E열을 실제 시급으로 수정하세요.`],
      [`마지막 업데이트: ${now}`],
    ];

    await overwriteSheet(sheets, spreadsheetId, SHEETS.SALARY, finalSalaryRows);
    await boldHeader(sheets, spreadsheetId, salarySheetId, 6);

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    console.log(`[GoogleSheets] Export completed at ${now}`);

    return {
      success: true,
      message: `구글 시트 내보내기 완료 (${now})\n알바생 ${workers.length}명, 스케줄 ${schedules.length}일치 데이터`,
      sheetUrl,
    };
  } catch (error: any) {
    console.error("[GoogleSheets] Export failed:", error);
    return {
      success: false,
      message: `내보내기 실패: ${error?.message || String(error)}`,
    };
  }
}

/** 구글 시트 연결 테스트 */
export async function testGoogleSheetsConnection(): Promise<boolean> {
  try {
    if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY || !SHEET_ID) return false;
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    return !!res.data.spreadsheetId;
  } catch {
    return false;
  }
}
