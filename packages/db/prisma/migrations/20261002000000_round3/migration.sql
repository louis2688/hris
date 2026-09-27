-- AlterEnum
ALTER TYPE "PayrollKind" ADD VALUE 'OFF_CYCLE';
ALTER TYPE "PayrollKind" ADD VALUE 'FINAL_PAY';

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('EARNING', 'DEDUCTION');
CREATE TYPE "SeparationReason" AS ENUM ('RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'OTHER');
CREATE TYPE "SeparationStatus" AS ENUM ('CLEARANCE', 'FINAL_PAY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CorrectionKind" AS ENUM ('MISSED_IN', 'MISSED_OUT', 'MISSED_BOTH', 'WORK_FROM_HOME', 'OFFICIAL_BUSINESS');
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "Recommendation" AS ENUM ('STRONG_YES', 'YES', 'NO', 'STRONG_NO');
CREATE TYPE "EmploymentEventType" AS ENUM ('HIRE', 'PROMOTION', 'TRANSFER', 'SALARY_CHANGE', 'STATUS_CHANGE', 'SEPARATION');
CREATE TYPE "GoalStatus" AS ENUM ('NOT_STARTED', 'ON_TRACK', 'AT_RISK', 'DONE', 'DROPPED');
CREATE TYPE "TrainingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AttendeeStatus" AS ENUM ('INVITED', 'ATTENDED', 'ABSENT');
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "CaseType" AS ENUM ('GRIEVANCE', 'INCIDENT', 'DISCIPLINARY');
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'NTE_ISSUED', 'EXPLANATION_RECEIVED', 'HEARING', 'DECISION', 'CLOSED');
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "bankName" TEXT, ADD COLUMN "bankAccountNo" TEXT, ADD COLUMN "customFields" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "LeaveType" ADD COLUMN "accrualPerMonth" DECIMAL(5,2), ADD COLUMN "allowEncashment" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "isCompensatory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Interview" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Vacancy" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "slug" TEXT, ADD COLUMN "closesAt" DATE, ADD COLUMN "referralBonus" DECIMAL(12,2);
ALTER TABLE "Candidate" ADD COLUMN "referrerId" TEXT, ADD COLUMN "referralBonusAdjustmentId" TEXT, ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "expiresAt" DATE, ADD COLUMN "requiresAck" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "caseId" TEXT;

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" DATE NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "endDate" DATE,
    "appliedInRunId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "payType" "PayType" NOT NULL,
    "basicPay" DECIMAL(12,2) NOT NULL,
    "allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Separation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reason" "SeparationReason" NOT NULL,
    "noticeDate" DATE,
    "lastDay" DATE NOT NULL,
    "status" "SeparationStatus" NOT NULL DEFAULT 'CLEARANCE',
    "exitInterview" JSONB,
    "leaveEncashDays" DECIMAL(5,2),
    "finalPayRunId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "Separation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BenefitPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'HMO',
    "employerShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "employeeShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "perDependentShare" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenefitPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeBenefit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "dependents" JSONB NOT NULL DEFAULT '[]',
    "cardNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeBenefit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CorrectionKind" NOT NULL,
    "inTime" TEXT,
    "outTime" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompOffRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "days" DECIMAL(4,1) NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompOffRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveEncashment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "adjustmentId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveEncashment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveBlockDate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveBlockDate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftChangeRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "shiftId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "fromTime" TEXT,
    "toTime" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobOffer" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobTitleId" TEXT,
    "departmentId" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "payType" "PayType" NOT NULL DEFAULT 'MONTHLY',
    "basicPay" DECIMAL(12,2) NOT NULL,
    "allowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startDate" DATE NOT NULL,
    "terms" JSONB NOT NULL DEFAULT '[]',
    "status" "OfferStatus" NOT NULL DEFAULT 'DRAFT',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "signatureName" TEXT,
    "declineReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewFeedback" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "rating" INTEGER NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmploymentEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EmploymentEventType" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "from" JSONB,
    "to" JSONB,
    "note" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmploymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cycleId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kra" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PeerFeedback" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "rating" INTEGER,
    "strengths" TEXT,
    "improvements" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PeerFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OneOnOne" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "agenda" TEXT,
    "notes" TEXT,
    "actionItems" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingEvent" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "trainer" TEXT,
    "cost" DECIMAL(12,2),
    "capacity" INTEGER,
    "status" "TrainingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "AttendeeStatus" NOT NULL DEFAULT 'INVITED',
    "result" TEXT,
    "score" INTEGER,
    "feedbackRating" INTEGER,
    "feedback" TEXT,
    "certificateId" TEXT,
    CONSTRAINT "TrainingAttendee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "audience" JSONB,
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyParticipation" (
    "surveyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyParticipation_pkey" PRIMARY KEY ("surveyId","employeeId")
);

CREATE TABLE "GrievanceCase" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "raisedById" TEXT,
    "type" "CaseType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "nteIssuedAt" TIMESTAMP(3),
    "nteDueAt" TIMESTAMP(3),
    "explanation" TEXT,
    "hearingAt" TIMESTAMP(3),
    "decision" TEXT,
    "sanction" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrievanceCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldDef" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT 'Employee',
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomFieldDef_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentAck" (
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentAck_pkey" PRIMARY KEY ("documentId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_slug_key" ON "Vacancy"("slug");
CREATE INDEX "Candidate_referrerId_idx" ON "Candidate"("referrerId");
CREATE INDEX "Document_caseId_idx" ON "Document"("caseId");
CREATE INDEX "Document_expiresAt_idx" ON "Document"("expiresAt");
CREATE INDEX "PayrollAdjustment_employeeId_effectiveDate_idx" ON "PayrollAdjustment"("employeeId", "effectiveDate");
CREATE INDEX "PayrollAdjustment_appliedInRunId_idx" ON "PayrollAdjustment"("appliedInRunId");
CREATE INDEX "EmployeeCompensation_employeeId_effectiveFrom_idx" ON "EmployeeCompensation"("employeeId", "effectiveFrom");
CREATE INDEX "Separation_employeeId_idx" ON "Separation"("employeeId");
CREATE INDEX "Separation_status_idx" ON "Separation"("status");
CREATE INDEX "EmployeeBenefit_employeeId_idx" ON "EmployeeBenefit"("employeeId");
CREATE INDEX "EmployeeBenefit_planId_idx" ON "EmployeeBenefit"("planId");
CREATE INDEX "AttendanceCorrection_employeeId_date_idx" ON "AttendanceCorrection"("employeeId", "date");
CREATE INDEX "AttendanceCorrection_status_idx" ON "AttendanceCorrection"("status");
CREATE INDEX "CompOffRequest_employeeId_idx" ON "CompOffRequest"("employeeId");
CREATE INDEX "CompOffRequest_status_idx" ON "CompOffRequest"("status");
CREATE INDEX "LeaveEncashment_employeeId_year_idx" ON "LeaveEncashment"("employeeId", "year");
CREATE INDEX "LeaveBlockDate_from_idx" ON "LeaveBlockDate"("from");
CREATE INDEX "ShiftChangeRequest_employeeId_idx" ON "ShiftChangeRequest"("employeeId");
CREATE INDEX "ShiftChangeRequest_status_idx" ON "ShiftChangeRequest"("status");
CREATE INDEX "Availability_employeeId_idx" ON "Availability"("employeeId");
CREATE UNIQUE INDEX "JobOffer_token_key" ON "JobOffer"("token");
CREATE INDEX "JobOffer_candidateId_idx" ON "JobOffer"("candidateId");
CREATE UNIQUE INDEX "InterviewFeedback_interviewId_interviewerId_key" ON "InterviewFeedback"("interviewId", "interviewerId");
CREATE INDEX "EmploymentEvent_employeeId_effectiveDate_idx" ON "EmploymentEvent"("employeeId", "effectiveDate");
CREATE INDEX "EmploymentEvent_appliedAt_idx" ON "EmploymentEvent"("appliedAt");
CREATE INDEX "Goal_employeeId_idx" ON "Goal"("employeeId");
CREATE INDEX "Goal_cycleId_idx" ON "Goal"("cycleId");
CREATE UNIQUE INDEX "PeerFeedback_reviewId_reviewerId_key" ON "PeerFeedback"("reviewId", "reviewerId");
CREATE INDEX "PeerFeedback_reviewerId_idx" ON "PeerFeedback"("reviewerId");
CREATE INDEX "OneOnOne_managerId_idx" ON "OneOnOne"("managerId");
CREATE INDEX "OneOnOne_employeeId_idx" ON "OneOnOne"("employeeId");
CREATE INDEX "TrainingEvent_startsAt_idx" ON "TrainingEvent"("startsAt");
CREATE UNIQUE INDEX "TrainingAttendee_eventId_employeeId_key" ON "TrainingAttendee"("eventId", "employeeId");
CREATE INDEX "TrainingAttendee_employeeId_idx" ON "TrainingAttendee"("employeeId");
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");
CREATE INDEX "GrievanceCase_employeeId_idx" ON "GrievanceCase"("employeeId");
CREATE INDEX "GrievanceCase_status_idx" ON "GrievanceCase"("status");
CREATE INDEX "CaseEvent_caseId_idx" ON "CaseEvent"("caseId");
CREATE UNIQUE INDEX "CustomFieldDef_key_key" ON "CustomFieldDef"("key");
CREATE INDEX "DocumentAck_userId_idx" ON "DocumentAck"("userId");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "GrievanceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_appliedInRunId_fkey" FOREIGN KEY ("appliedInRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Separation" ADD CONSTRAINT "Separation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Separation" ADD CONSTRAINT "Separation_finalPayRunId_fkey" FOREIGN KEY ("finalPayRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BenefitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompOffRequest" ADD CONSTRAINT "CompOffRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompOffRequest" ADD CONSTRAINT "CompOffRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveEncashment" ADD CONSTRAINT "LeaveEncashment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveEncashment" ADD CONSTRAINT "LeaveEncashment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveBlockDate" ADD CONSTRAINT "LeaveBlockDate_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftChangeRequest" ADD CONSTRAINT "ShiftChangeRequest_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "WorkShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmploymentEvent" ADD CONSTRAINT "EmploymentEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PeerFeedback" ADD CONSTRAINT "PeerFeedback_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PerformanceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeerFeedback" ADD CONSTRAINT "PeerFeedback_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAttendee" ADD CONSTRAINT "TrainingAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TrainingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAttendee" ADD CONSTRAINT "TrainingAttendee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingAttendee" ADD CONSTRAINT "TrainingAttendee_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyParticipation" ADD CONSTRAINT "SurveyParticipation_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyParticipation" ADD CONSTRAINT "SurveyParticipation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrievanceCase" ADD CONSTRAINT "GrievanceCase_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "GrievanceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentAck" ADD CONSTRAINT "DocumentAck_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentAck" ADD CONSTRAINT "DocumentAck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill salary history from current compensation
INSERT INTO "EmployeeCompensation" ("id", "employeeId", "effectiveFrom", "payType", "basicPay", "allowance", "reason")
SELECT 'comp_' || "id", "id", "hireDate", "payType", "basicPay", "allowance", 'Initial record'
FROM "Employee" WHERE "basicPay" IS NOT NULL;
