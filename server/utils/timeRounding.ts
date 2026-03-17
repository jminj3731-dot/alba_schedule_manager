/**
 * 시간을 가장 가까운 30분 단위로 반올림
 * 예: "17:23" → "17:30", "17:44" → "17:30", "17:45" → "18:00"
 */
export function roundTimeToNearest30Min(timeStr: string): string {
  const [hours, minutes] = timeStr.split(":").map(Number);
  
  if (isNaN(hours) || isNaN(minutes)) {
    return timeStr; // 유효하지 않은 시간은 그대로 반환
  }

  let roundedMinutes = minutes;
  let roundedHours = hours;

  // 0~14분 → 0분 (정각)
  // 15~44분 → 30분
  // 45~59분 → 다음 시간 정각
  if (minutes < 15) {
    roundedMinutes = 0;
  } else if (minutes < 45) {
    roundedMinutes = 30;
  } else {
    roundedMinutes = 0;
    roundedHours = (hours + 1) % 24;
  }

  return `${String(roundedHours).padStart(2, "0")}:${String(roundedMinutes).padStart(2, "0")}`;
}

/**
 * 시간 문자열 유효성 검증 (HH:MM 형식)
 */
export function isValidTimeFormat(timeStr: string): boolean {
  const regex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return regex.test(timeStr);
}
