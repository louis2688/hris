-- CreateEnum
CREATE TYPE "ApproverKind" AS ENUM ('MANAGER', 'HR', 'ADMIN');
CREATE TYPE "QualificationKind" AS ENUM ('SKILL', 'LICENSE', 'MEMBERSHIP');
CREATE TYPE "PunchDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "PunchSource" AS ENUM ('WEB', 'MOBILE', 'DEVICE', 'MANUAL');
CREATE TYPE "PunchMethod" AS ENUM ('NONE', 'PASSKEY', 'PHOTO', 'FINGERPRINT', 'FACE', 'CARD', 'PIN');
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "CandidateStage" AS ENUM ('APPLIED', 'SHORTLISTED', 'INTERVIEW', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "InterviewResult" AS ENUM ('PENDING', 'PASSED', 'FAILED');
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "ReviewStatus" AS ENUM ('SELF_REVIEW', 'MANAGER_REVIEW', 'COMPLETED');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "shiftId" TEXT, ADD COLUMN "biometricId" TEXT;
ALTER TABLE "LeaveType" ADD COLUMN "approvalChain" "ApproverKind"[] DEFAULT ARRAY['MANAGER']::"ApproverKind"[];
ALTER TABLE "LeaveRequest" ADD COLUMN "approvalChain" "ApproverKind"[] DEFAULT ARRAY[]::"ApproverKind"[], ADD COLUMN "currentLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeaveRequestEvent" ADD COLUMN "level" INTEGER;

-- CreateTable
CREATE TABLE "Nationality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Nationality_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Qualification" (
    "id" TEXT NOT NULL,
    "kind" "QualificationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeQualification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "qualificationId" TEXT NOT NULL,
    "level" TEXT,
    "number" TEXT,
    "issuedDate" DATE,
    "expiryDate" DATE,
    "amount" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkShift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '09:00',
    "endTime" TEXT NOT NULL DEFAULT '18:00',
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "workDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkShift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendancePunch" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "direction" "PunchDirection",
    "source" "PunchSource" NOT NULL,
    "method" "PunchMethod" NOT NULL DEFAULT 'NONE',
    "deviceId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "note" TEXT,
    "photo" BYTEA,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendancePunch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BiometricDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "locationId" TEXT,
    "apiKeyHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "timesheetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activity" TEXT,
    "date" DATE NOT NULL,
    "hours" DECIMAL(4,2) NOT NULL,
    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vacancy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "departmentId" TEXT,
    "locationId" TEXT,
    "hiringManagerId" TEXT,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "VacancyStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "vacancyId" TEXT,
    "stage" "CandidateStage" NOT NULL DEFAULT 'APPLIED',
    "source" TEXT,
    "resumeUrl" TEXT,
    "notes" TEXT,
    "appliedAt" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiredEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "interviewerId" TEXT,
    "location" TEXT,
    "result" "InterviewResult" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "jobTitleId" TEXT,
    "minRating" INTEGER NOT NULL DEFAULT 1,
    "maxRating" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'SELF_REVIEW',
    "selfComment" TEXT,
    "managerComment" TEXT,
    "finalRating" DECIMAL(3,2),
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "kpiId" TEXT,
    "kpiName" TEXT NOT NULL,
    "minRating" INTEGER NOT NULL,
    "maxRating" INTEGER NOT NULL,
    "selfRating" INTEGER,
    "selfComment" TEXT,
    "managerRating" INTEGER,
    "managerComment" TEXT,
    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_biometricId_key" ON "Employee"("biometricId");
CREATE UNIQUE INDEX "Nationality_name_key" ON "Nationality"("name");
CREATE UNIQUE INDEX "Qualification_kind_name_key" ON "Qualification"("kind", "name");
CREATE INDEX "EmployeeQualification_employeeId_idx" ON "EmployeeQualification"("employeeId");
CREATE UNIQUE INDEX "WorkShift_name_key" ON "WorkShift"("name");
CREATE INDEX "AttendancePunch_at_idx" ON "AttendancePunch"("at");
CREATE UNIQUE INDEX "AttendancePunch_employeeId_at_key" ON "AttendancePunch"("employeeId", "at");
CREATE UNIQUE INDEX "BiometricDevice_serial_key" ON "BiometricDevice"("serial");
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");
CREATE INDEX "Timesheet_status_idx" ON "Timesheet"("status");
CREATE UNIQUE INDEX "Timesheet_employeeId_weekStart_key" ON "Timesheet"("employeeId", "weekStart");
CREATE INDEX "TimesheetEntry_timesheetId_idx" ON "TimesheetEntry"("timesheetId");
CREATE UNIQUE INDEX "Candidate_hiredEmployeeId_key" ON "Candidate"("hiredEmployeeId");
CREATE INDEX "Candidate_vacancyId_idx" ON "Candidate"("vacancyId");
CREATE INDEX "Candidate_stage_idx" ON "Candidate"("stage");
CREATE INDEX "Interview_candidateId_idx" ON "Interview"("candidateId");
CREATE INDEX "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");
CREATE INDEX "PerformanceReview_reviewerId_idx" ON "PerformanceReview"("reviewerId");
CREATE UNIQUE INDEX "PerformanceReview_cycleId_employeeId_key" ON "PerformanceReview"("cycleId", "employeeId");
CREATE INDEX "ReviewItem_reviewId_idx" ON "ReviewItem"("reviewId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_qualificationId_fkey" FOREIGN KEY ("qualificationId") REFERENCES "Qualification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_hiredEmployeeId_fkey" FOREIGN KEY ("hiredEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: existing leave requests keep single-level semantics
UPDATE "LeaveRequest" SET "approvalChain" = ARRAY['MANAGER']::"ApproverKind"[] WHERE "status" = 'PENDING';
