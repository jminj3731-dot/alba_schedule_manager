# Project TODO

## 데이터베이스
- [x] workers 테이블 (알바생 명단, 숙련도, 고정 휴무)
- [x] schedules 테이블 (날짜별 스케줄, A/B/C 타임, 운영여부)
- [x] 마이그레이션 실행

## 백엔드 API
- [x] 알바생 CRUD (workers router)
- [x] 스케줄 CRUD (schedules router)
- [x] 주간 근무 횟수 집계 API
- [x] 유효성 검사 로직 (메인 숙련자 부재, 정우주 제약)

## 프론트엔드 - 공통
- [x] 레드(#CC0000)/블랙(#000000) 테마 적용
- [x] 다크 테마 기반 디자인
- [x] 모바일 최적화 레이아웃
- [x] 3탭 네비게이션 (Settings, Master, Worker_View)

## 프론트엔드 - Settings 탭
- [x] 알바생 명단 표시 (이름, 숙련도, 고정 휴무 요일)
- [x] 알바생 추가/수정/삭제 기능
- [x] 주간 근무 횟수 자동 집계
- [x] 상태 표시 (적정/부족/초과)

## 프론트엔드 - Master 탭
- [x] 날짜별 스케줄 입력 (A/B/C 타임)
- [x] 운영여부 체크박스
- [x] 알바생별 드롭다운 선택
- [x] 조건부 서식: 정우주 목/일 배치 시 빨간색 경고
- [x] 조건부 서식: 휴무일 회색 처리
- [x] 오류체크: 메인 숙련자 부재 시 경고 메시지

## 프론트엔드 - Worker_View 탭
- [x] 이번 주 스케줄 필터링
- [x] 달력/카드 형태 시각화
- [x] 모바일 최적화 뷰

## 테스트
- [x] 백엔드 유닛 테스트 작성
- [x] 유효성 검사 테스트

## v2 업데이트 요구사항
- [x] 메인 화면: 알바생 이름 입력 → 해당 스케줄 표시
- [x] Settings/Master 비밀번호("대한한우") 보호 및 숨김 처리
- [x] 선호 근무일 입력 기능 (알바생별)
- [x] 선호 근무일 기반 자동 배정 기능
- [x] DB: workers 테이블에 preferredDays 컬럼 추가
- [x] 백엔드: 자동 배정 API 추가
- [x] 테스트 업데이트

## v3 업데이트 요구사항
- [x] 메인 화면에 "전체 스케줄 확인" 버튼 추가
- [x] 전체 알바생 주간 스케줄 한눈에 보기 페이지 구현
- [x] 날짜별 × 타임별 그리드로 모든 알바생 배치 표시
- [x] 모바일 최적화 전체 뷰

## 버그 수정
- [x] 정우주 근무불가 요일 조건 로직 수정 — 일요일, 목요일만 빨간색 경고 표시 (로직 정상 동작 확인, 빨간색은 메인 숙련자 부재 때문)

## v4 알림 기능 요구사항
- [x] DB: 알림 로그 테이블 생성 (notificationLogs)
- [x] 백엔드: 알림 발송 API 추가 (notifyWorker)
- [x] 프론트엔드: 스케줄 조회 시 알림 발송 (전민서 제외)
- [x] 프론트엔드: 선호 근무일 수정 시 알림 발송 (전민서 제외)
- [x] 알림 내용 커스터마이징 (스케줄 확인, 선호 근무일 수정)
- [x] 알림 기능 단위 테스트 (전민서 제외 로직, 메시지 생성)

## v5 정우주 하드코딩 제약 제거
- [x] shared/types.ts - 단, 단답 로직은 유지
- [x] FullSchedule.tsx - 정우주 경고 표시 로직 제거
- [x] Master.tsx - 정우주 제약 검증 로직 없음
- [x] 모든 알바생 동등 처리 확인

## v6 날짜 버그 수정
- [x] Master.tsx getWeekDates 함수 날짜 계산 버그 수정 (toISOString UTC 오프셋 문제 → toLocalDateStr 함수로 교체)
- [x] FullSchedule.tsx 동일 버그 수정
- [x] Home.tsx 동일 버그 수정

## v7 Settings 이번 주 근무 현황 버그 수정
- [x] 백엔드 weeklyWorkerCounts API 날짜 범위 계산 수정 (일~토 기준, 백엔드는 정상 동작 확인)
- [x] Settings.tsx getWeekRange toISOString UTC 오프셋 문제 해결 (toLocalDateStr 적용)
- [x] 이번 주 근무 현황 카드에 날짜 범위 표시 추가 (MM/DD (일) ~ MM/DD (토))

## v8 퇴근 시간 편집 기능
- [x] DB: schedules 테이블에 aTimeEndTime, bTimeEndTime, cTimeEndTime 컬럼 추가
- [x] 백엔드: 퇴근 시간 업데이트 API 추가 (updateEndTime)
- [x] Home.tsx: 개인 스케줄 카드에 퇴근 시간 편집 아이콘 추가
- [x] Home.tsx: 시간 선택 팝오버 (19:00~23:30, 30분 단위)
- [x] FullSchedule.tsx: 전체 스케줄 표에 퇴근 시간 표시
- [x] 30개 테스트 모두 통과

## v9 Master 출근/퇴근 시간 편집 기능
- [x] DB: schedules 테이블에 aTimeStartTime, bTimeStartTime, cTimeStartTime 컬럼 추가
- [x] 백엔드: updateScheduleTime API 확장 (출근+퇴근 시간 동시 수정)
- [x] Master.tsx: 타임별 출근/퇴근 시간 편집 UI 추가 (시계 아이콘 버튼 + 팝오버)
- [x] Home.tsx: 출근 시간 DB에서 읽도록 반영
- [x] FullSchedule.tsx: 출근 시간 DB에서 읽도록 반영
- [x] 30개 테스트 모두 통과

## v10 월간 근무 통계 페이지
- [x] 백엔드: 월간 근무 일수/시간 집계 API (getMonthlyStats)
- [x] Statistics.tsx: 알바생별 월간 근무 일수 바 차트
- [x] Statistics.tsx: 알바생별 월간 근무 시간 바 차트
- [x] Statistics.tsx: 타임별(A/B/C) 근무 분포 바 차트
- [x] Statistics.tsx: 알바생 카드 클릭 시 상세 일별 내역 표시
- [x] Statistics.tsx: 월 선택 네비게이션
- [x] AppLayout: 통계 탭 추가
- [x] App.tsx: /statistics 라우팅 추가
- [x] 30개 테스트 모두 통과

## v11 엑셀/CSV 내보내기 기능
- [x] 백엔드: 기존 statistics.monthly API 재활용 (dailyBreakdown 포함)
- [x] 프론트엔드: CSV 내보내기 버튼 (BOM 포함, 한글 깨짐 방지)
- [x] 프론트엔드: 엑셀(XLSX) 내보내기 버튼 — 요약/상세내역 2개 시트
- [x] 내보내기 데이터 형식: 이름, 숙련도, 날짜, 요일, 타임, 출근시간, 퇴근시간, 근무시간
- [x] 파일명: 알바스케줄_YYYY년MM월.csv / .xlsx
- [x] 30개 테스트 모두 통과

## v12 급여 계산기 페이지 및 시급 수정
- [x] 기본 시급 10,030원 → 10,320원으로 수정 (Statistics.tsx, CSV/엑셀 내보내기)
- [x] 급여 계산기 페이지 (PayCalculator.tsx) 신규 생성
- [x] 알바생 선택 드롭다운
- [x] 급여일 입력 (기본값 14일)
- [x] 시급 선택 버튼 (10,320원 / 11,000원 / 12,000원 + 직접 입력)
- [x] 계산하기 버튼 → 예상 월급 표시
- [x] 상세보기 → 급여 기간 내 일별 근무 내역 표시
- [x] App.tsx 라우팅 등록 (/pay-calculator)
- [x] AppLayout 탭 네비게이션에 계산기 탭 추가
- [x] 41개 테스트 통과

## v13 관리자 활동 로그 탭
- [x] DB: activityLogs 테이블 생성 (id, workerId, workerName, actionType, description, metadata, createdAt)
- [x] 백엔드: 로그 저장 API (createActivityLog)
- [x] 백엔드: 로그 조회 API (getActivityLogs - 필터: 알바생, 액션타입, 날짜범위)
- [x] 출퇴근 수정 시 로그 기록 (Home.tsx - updateEndTime)
- [x] 선호요일 변경 시 로그 기록 (Home.tsx - updatePreferredDays)
- [x] 휴무요일 변경 시 로그 기록 (Settings.tsx - updateWorker)
- [x] 알바생 추가/수정/삭제 시 로그 기록 (Settings.tsx)
- [x] ActivityLog.tsx 신규 생성 (날짜별 그룹, 시간대별 정렬, 필터 기능)
- [x] App.tsx 라우팅 등록 (/activity-log)
- [x] AppLayout: 메인 버튼 우상단으로 이동, 하단 로그 탭 추가
- [x] 45개 테스트 통과

## v14 출퇴근 시간 자동 반올림 (30분 단위)
- [x] 출퇴근 시간 30분 단위 반올림 로직 구현 (5:20 → 5:30)
- [x] 실제 DB 기록은 원래 시간(5:20)으로 저장 (aTimeActualEndTime 등 새 친드 추가)
- [x] 근무 내역 화면에는 반올림된 시간(5:30) 표시
- [x] 출퇴근 기록 로그에는 원래 시간(5:20) 표시
- [x] Home.tsx 출퇴근 버튼 클릭 시 자동 반올림 적용
- [x] 테스트 및 검증

## v15 출퇴근 버튼 UI 구현
- [x] 오늘 근무 카드 하단에 출근/퇴근 버튼 표시
- [x] 출근 버튼: 클릭 시 현재 시간 → 30분 반올림 → startTime 기록
- [x] 퇴근 버튼: 클릭 시 현재 시간 → 30분 반올림 → endTime 기록
- [x] 출근 완료 시 버튼 비활성화 + 기록된 시간 표시
- [x] 퇴근 완료 시 버튼 비활성화 + 기록된 시간 표시
- [x] 활동 로그에 출퇴근 기록
- [x] 54개 테스트 통과

## v16 오늘 출퇴근 고정 섹션
- [x] 프로필 카드 바로 아래에 "오늘 출퇴근" 섹션 추가
- [x] 오늘 근무 있으면: 타임/시간 + 출근/퇴근 버튼 표시
- [x] 오늘 근무 없으면: "오늘 근무 없음" 표시
- [x] 출근/퇴근 완료 시 완료 상태 표시

## v17 GPS 위치 기반 출퇴근 잠금
- [x] 가게 좌표 확인 (위도 37.902136, 경도 127.0552767)
- [x] GPS 거리 계산 유틸 함수 (Haversine 공식)
- [x] 출퇴근 버튼 클릭 시 위치 권한 요청 및 거리 체크
- [x] 반경 100m 밖이면 클릭 차단 + 거리 안내 메시지
- [x] 위치 확인 중 스피너 로딩 상태 표시
- [x] 위치 권한 거부 시 안내 메시지
- [x] 58개 테스트 통과

## v18 출근 알림 (notifyOwner 연동)
- [x] checkIn 라우터에서 출근 성공 시 notifyOwner 호출
- [x] 알림 제목: "{이름}님이 출근했습니다"
- [x] 알림 내용: 날짜, 타임, 실제 출근 시간, 반올림 시간 포함
- [x] 63개 테스트 통과

## v19 알바생별 급여일 저장
- [x] DB workers 테이블에 payDay(INT, 1~31) 필드 추가
- [x] Settings.tsx 알바생 카드에 급여일 입력 필드 추가
- [x] PayCalculator.tsx에서 알바생 선택 시 급여일 자동 불러오기
- [x] 급여일 미설정 시 기본값 14일 사용
- [x] 67개 테스트 통과

## v20 버그수정: 퇴근 시간 수정 오류
- [x] 퇴근 시간 수정 팝업에서 선택한 시간이 반영되지 않고 현재 시간으로 저장되던 버그 수정 (선택한 t 값 직접 저장으로 수정)

## v21 출근 시간 기록 로직 변경
- [x] 예정 출근 시간 이전/정시에 누르면 → 예정 출근 시간으로 기록
- [x] 예정 출근 시간 이후에 누르면 → 다음 30분 단위 올림으로 기록 (5:40 → 6:00)
- [x] roundTimeToNearest30Min 대신 calcCheckInTime(actualTime, scheduledTime) 함수로 교체
- [x] 71개 테스트 통과
