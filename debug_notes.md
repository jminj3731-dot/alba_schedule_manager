# 디버그 노트: 월요일 정우주 경고 표시 문제

## 문제 상황
- 월요일(16일)에 정우주가 배치되어 있는데 빨간색 경고가 표시됨
- 정우주는 일요일, 목요일에만 근무불가 설정
- 월요일은 근무 가능한 요일이므로 경고가 표시되면 안 됨

## 코드 분석
FullSchedule.tsx의 isRestrictedAssignment 함수:
```typescript
function isRestrictedAssignment(schedule: typeof schedules[0]) {
  const wooJuWorker = workers.find((w) => w.name === "정우주");
  if (!wooJuWorker) return false;
  const dayName = schedule.dayOfWeek?.trim();
  if (dayName !== "목" && dayName !== "일") {
    return false;  // 목요일, 일요일이 아니면 false 반환 (경고 없음)
  }
  const isAssigned = (
    schedule.aTimeWorkerId === wooJuWorker.id ||
    schedule.bTimeWorkerId === wooJuWorker.id ||
    schedule.cTimeWorkerId === wooJuWorker.id
  );
  return isAssigned;
}
```

## 예상 원인
1. dayOfWeek 값이 공백이나 다른 형식일 가능성
2. 데이터베이스에서 dayOfWeek가 다르게 저장되었을 가능성
3. 렌더링 시 schedule 객체가 올바르지 않을 가능성

## 다음 단계
- 데이터베이스에서 dayOfWeek 값 직접 확인
- 브라우저 콘솔에서 schedule 객체 값 로깅
- isRestrictedAssignment 함수에 로깅 추가
