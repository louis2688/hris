-- Perf: indexes for foreign keys / filter columns that had none (Postgres does not index FKs automatically).
-- IF NOT EXISTS so a re-run is harmless. Tables are small today; plain CREATE INDEX locks writes briefly.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_locationId_idx" ON "Employee"("locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_jobTitleId_idx" ON "Employee"("jobTitleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Employee_shiftId_idx" ON "Employee"("shiftId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveRequest_leaveTypeId_idx" ON "LeaveRequest"("leaveTypeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmployeeQualification_qualificationId_idx" ON "EmployeeQualification"("qualificationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimesheetEntry_projectId_idx" ON "TimesheetEntry"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TimesheetEntry_date_idx" ON "TimesheetEntry"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Interview_interviewerId_idx" ON "Interview"("interviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceReview_employeeId_idx" ON "PerformanceReview"("employeeId");
