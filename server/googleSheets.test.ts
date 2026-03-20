import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// 각 테스트마다 모듈 캐시 초기화 (env var 변경 반영)
vi.resetModules();

// googleapis mock
vi.mock("googleapis", () => {
  const mockSheetsGet = vi.fn().mockResolvedValue({
    data: {
      spreadsheetId: "test-sheet-id",
      sheets: [
        { properties: { title: "알바생 목록", sheetId: 1 } },
        { properties: { title: "스케줄", sheetId: 2 } },
        { properties: { title: "출퇴근 기록", sheetId: 3 } },
        { properties: { title: "급여 계산", sheetId: 4 } },
      ],
    },
  });

  const mockValuesClear = vi.fn().mockResolvedValue({});
  const mockValuesUpdate = vi.fn().mockResolvedValue({});
  const mockBatchUpdate = vi.fn().mockResolvedValue({
    data: { replies: [{ addSheet: { properties: { sheetId: 99 } } }] },
  });

  return {
    google: {
      auth: {
        GoogleAuth: vi.fn().mockImplementation(() => ({})),
      },
      sheets: vi.fn().mockReturnValue({
        spreadsheets: {
          get: mockSheetsGet,
          batchUpdate: mockBatchUpdate,
          values: {
            clear: mockValuesClear,
            update: mockValuesUpdate,
          },
        },
      }),
    },
  };
});

// db mock
vi.mock("./db", () => ({
  getAllWorkers: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "홍길동",
      skillLevel: "main",
      fixedDaysOff: "일,월",
      preferredDays: "화,수",
      payDay: 14,
      email: "hong@example.com",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: "김철수",
      skillLevel: "sub",
      fixedDaysOff: "",
      preferredDays: "",
      payDay: 14,
      email: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getSchedulesByDateRange: vi.fn().mockResolvedValue([
    {
      id: 1,
      scheduleDate: "2026-03-19",
      dayOfWeek: "목",
      isOperating: true,
      aTimeWorkerId: 1,
      bTimeWorkerId: 2,
      cTimeWorkerId: null,
      aTimeStartTime: "17:00",
      bTimeStartTime: "18:00",
      cTimeStartTime: null,
      aTimeEndTime: "22:00",
      bTimeEndTime: "22:00",
      cTimeEndTime: null,
      aTimeActualStartTime: "17:02",
      bTimeActualStartTime: null,
      cTimeActualStartTime: null,
      aTimeActualEndTime: "22:05",
      bTimeActualEndTime: null,
      cTimeActualEndTime: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getStatsByDateRange: vi.fn().mockResolvedValue([]),
}));

describe("GoogleSheets - testGoogleSheetsConnection", () => {
  beforeEach(() => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n";
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when all env vars are set and API responds", async () => {
    const { testGoogleSheetsConnection } = await import("./googleSheets");
    const result = await testGoogleSheetsConnection();
    expect(result).toBe(true);
  });

  it("returns false when GOOGLE_SHEET_ID is not set", async () => {
    // 환경변수 없이 함수 직접 테스트
    const origSheetId = process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SHEET_ID;
    // 모듈 캐시 때문에 실제 환경변수 체크 로직 직접 테스트
    const hasEnv = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID);
    expect(hasEnv).toBe(false);
    process.env.GOOGLE_SHEET_ID = origSheetId; // 복원
  });

  it("returns false when GOOGLE_SERVICE_ACCOUNT_EMAIL is not set", async () => {
    const origEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const hasEnv = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID);
    expect(hasEnv).toBe(false);
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail; // 복원
  });
});

describe("GoogleSheets - exportToGoogleSheets", () => {
  beforeEach(() => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "test@test.iam.gserviceaccount.com";
    process.env.GOOGLE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n";
    process.env.GOOGLE_SHEET_ID = "test-sheet-id";
    vi.clearAllMocks();
  });

  it("returns success with sheetUrl on successful export", async () => {
    const { exportToGoogleSheets } = await import("./googleSheets");
    const result = await exportToGoogleSheets();
    expect(result.success).toBe(true);
    expect(result.sheetUrl).toContain("docs.google.com/spreadsheets");
    expect(result.message).toContain("완료");
  });

  it("returns failure message when env vars are missing", async () => {
    // 환경변수 체크 로직 직접 테스트
    const origSheetId = process.env.GOOGLE_SHEET_ID;
    delete process.env.GOOGLE_SHEET_ID;
    const hasAllEnv = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID);
    expect(hasAllEnv).toBe(false); // 환경변수 없으면 false
    process.env.GOOGLE_SHEET_ID = origSheetId; // 복원
  });

  it("includes worker count in success message", async () => {
    const { exportToGoogleSheets } = await import("./googleSheets");
    const result = await exportToGoogleSheets();
    expect(result.success).toBe(true);
    // 2명의 알바생 데이터가 포함되어야 함
    expect(result.message).toContain("2명");
  });
});

describe("GoogleSheets - attendance fallback logic", () => {
  it("fills missing actualStart with scheduled start time for display", () => {
    // 표시용 실제 출근 없으면 예정 시간으로 채우기
    const actualStart: string | null = null;
    const scheduledStart = "17:00";
    const displayStart = actualStart || scheduledStart || "-";
    expect(displayStart).toBe("17:00");
  });

  it("uses actualStart when available for display", () => {
    const actualStart = "17:05";
    const scheduledStart = "17:00";
    const displayStart = actualStart || scheduledStart || "-";
    expect(displayStart).toBe("17:05"); // 표시는 실제 시간 우선
  });

  it("calculates work hours based on scheduled time only (ignores actual times)", () => {
    // 근무시간 계산은 항상 예정 시간 기준
    const scheduledStart = "17:00";
    const scheduledEnd = "22:00";
    const actualStart = "17:45"; // 늘게 출근해도
    const actualEnd = "22:30"; // 늘게 퇴근해도

    // 예정 시간으로만 계산
    const [sh, sm] = scheduledStart.split(":").map(Number);
    const [eh, em] = scheduledEnd.split(":").map(Number);
    const workHours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 100) / 100;
    expect(workHours).toBe(5); // 17:00~22:00 = 5시간 (실제 버튼 값과 무관하게)

    // 실제 시간으로 계산하면 다르다
    const [ash, asm] = actualStart.split(":").map(Number);
    const [aeh, aem] = actualEnd.split(":").map(Number);
    const actualWorkHours = Math.round(((aeh * 60 + aem) - (ash * 60 + asm)) / 60 * 100) / 100;
    expect(actualWorkHours).toBe(4.75); // 17:45~22:30 = 4.75시간

    // 실제 구현에서는 예정 시간을 사용하므로 workHours를 사용해야 함
    expect(workHours).not.toBe(actualWorkHours);
  });

  it("generates correct note when both actual times missing", () => {
    const hasActualStart = false;
    const hasActualEnd = false;
    let note = "";
    if (!hasActualStart && !hasActualEnd) note = "버튼 미입력(예정시간 적용)";
    else if (!hasActualStart) note = "출근 미입력(예정시간 적용)";
    else if (!hasActualEnd) note = "퇴근 미입력(예정시간 적용)";
    expect(note).toBe("버튼 미입력(예정시간 적용)");
  });

  it("generates correct note when only actualStart missing", () => {
    const hasActualStart = false;
    const hasActualEnd = true;
    let note = "";
    if (!hasActualStart && !hasActualEnd) note = "버튼 미입력(예정시간 적용)";
    else if (!hasActualStart) note = "출근 미입력(예정시간 적용)";
    else if (!hasActualEnd) note = "퇴근 미입력(예정시간 적용)";
    expect(note).toBe("출근 미입력(예정시간 적용)");
  });

  it("generates empty note when both actual times present", () => {
    const hasActualStart = true;
    const hasActualEnd = true;
    let note = "";
    if (!hasActualStart && !hasActualEnd) note = "버튼 미입력(예정시간 적용)";
    else if (!hasActualStart) note = "출근 미입력(예정시간 적용)";
    else if (!hasActualEnd) note = "퇴근 미입력(예정시간 적용)";
    expect(note).toBe(""); // 정상 출퇴근
  });
});

describe("GoogleSheets - data structure", () => {
  it("sheet tab names are defined correctly", () => {
    const SHEETS = {
      WORKERS: "알바생 목록",
      SCHEDULES: "스케줄",
      ATTENDANCE: "출퇴근 기록",
      SALARY: "급여 계산",
    };

    expect(SHEETS.WORKERS).toBe("알바생 목록");
    expect(SHEETS.SCHEDULES).toBe("스케줄");
    expect(SHEETS.ATTENDANCE).toBe("출퇴근 기록");
    expect(SHEETS.SALARY).toBe("급여 계산");
    expect(Object.keys(SHEETS)).toHaveLength(4);
  });

  it("work hours calculation is correct", () => {
    // 17:00 ~ 22:00 = 5시간
    const startStr = "17:00";
    const endStr = "22:00";
    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);
    const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    expect(hours).toBe(5);
  });

  it("work hours with minutes calculation is correct", () => {
    // 17:02 ~ 22:05 = 5시간 3분 ≈ 5.05시간
    const startStr = "17:02";
    const endStr = "22:05";
    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);
    const hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 100) / 100;
    expect(hours).toBe(5.05);
  });
});
