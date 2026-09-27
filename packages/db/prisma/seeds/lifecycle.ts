/**
 * Lifecycle demo data: HIRE events for everyone, a promotion last year, a scheduled transfer next month,
 * three custom fields with a few values, an incident case waiting for the employee's explanation,
 * and documents with expiry dates (one expired, one due in 20 days). Idempotent (natural keys).
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";

const DAY = 86_400_000;
const SEED_NOTE = "(seed)";

export async function seedLifecycle(prisma: PrismaClient) {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
  const inDays = (n: number) => new Date(today.getTime() + n * DAY);
  const emps = await prisma.employee.findMany({
    where: { deletedAt: null },
    select: {
      id: true, employeeCode: true, hireDate: true, employmentStatus: true, customFields: true,
      jobTitleId: true, departmentId: true, locationId: true, managerId: true,
      jobTitle: { select: { name: true } }, department: { select: { name: true } }, location: { select: { name: true } },
      manager: { select: { firstName: true, lastName: true, preferredName: true } },
    },
  });
  const by = new Map(emps.map((e) => [e.employeeCode, e]));
  const hr = await prisma.user.findFirst({ where: { email: "hr@hris.local" }, select: { id: true } });

  // HIRE event for every employee without one.
  const hired = new Set((await prisma.employmentEvent.findMany({ where: { type: "HIRE" }, select: { employeeId: true } })).map((r) => r.employeeId));
  for (const e of emps) {
    if (hired.has(e.id)) continue;
    await prisma.employmentEvent.create({
      data: {
        employeeId: e.id,
        type: "HIRE",
        effectiveDate: e.hireDate,
        appliedAt: e.hireDate,
        to: {
          jobTitleId: e.jobTitleId, jobTitle: e.jobTitle?.name ?? null,
          departmentId: e.departmentId, department: e.department?.name ?? null,
          locationId: e.locationId, location: e.location?.name ?? null,
          managerId: e.managerId, manager: e.manager ? `${e.manager.preferredName ?? e.manager.firstName} ${e.manager.lastName}` : null,
          employmentStatus: e.employmentStatus,
        },
      },
    });
  }

  const once = async (employeeId: string, type: "PROMOTION" | "TRANSFER", data: object) => {
    if (await prisma.employmentEvent.findFirst({ where: { employeeId, type, note: { endsWith: SEED_NOTE } } })) return;
    await prisma.employmentEvent.create({ data: { employeeId, type, createdById: hr?.id ?? null, ...data } as never });
  };

  // Promotion last year: Paolo went from Associate to Software Engineer.
  const paolo = by.get("EMP-0005");
  if (paolo) {
    await once(paolo.id, "PROMOTION", {
      effectiveDate: new Date(Date.UTC(today.getUTCFullYear() - 1, 5, 1)),
      appliedAt: new Date(Date.UTC(today.getUTCFullYear() - 1, 5, 1)),
      from: { jobTitle: "Associate Software Engineer" },
      to: { jobTitleId: paolo.jobTitleId, jobTitle: paolo.jobTitle?.name ?? "Software Engineer" },
      note: `Promoted after the annual review ${SEED_NOTE}`,
    });
  }

  // Scheduled transfer next month: Kristine moves from Cebu to Manila HQ (applied by the daily job).
  const kristine = by.get("EMP-0006");
  const hq = await prisma.location.findUnique({ where: { name: "Manila HQ" }, select: { id: true, name: true } });
  if (kristine && hq) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    await once(kristine.id, "TRANSFER", { effectiveDate: first, to: { locationId: hq.id, location: hq.name }, note: `Relocating to the QA hub in Manila ${SEED_NOTE}` });
  }

  // Custom fields.
  const fields = [
    { key: "shirt_size", label: "Shirt size", type: "SELECT", options: ["XS", "S", "M", "L", "XL", "XXL"], sortOrder: 1 },
    { key: "blood_type", label: "Blood type", type: "SELECT", options: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"], sortOrder: 2 },
    { key: "emergency_medical_notes", label: "Emergency medical notes", type: "TEXT", options: [], sortOrder: 3 },
  ] as const;
  for (const f of fields) await prisma.customFieldDef.upsert({ where: { key: f.key }, update: {}, create: { ...f, options: [...f.options] } });
  const values: [string, Record<string, string>][] = [
    ["EMP-0004", { shirt_size: "S", blood_type: "O+" }],
    ["EMP-0005", { shirt_size: "L", blood_type: "A+", emergency_medical_notes: "Asthma, carries an inhaler" }],
    ["EMP-0003", { shirt_size: "XL" }],
    ["EMP-0010", { shirt_size: "M", blood_type: "B+" }],
  ];
  for (const [code, v] of values) {
    const e = by.get(code);
    if (!e) continue;
    const cur = (e.customFields ?? {}) as Record<string, string>;
    await prisma.employee.update({ where: { id: e.id }, data: { customFields: { ...v, ...cur } } });
  }

  // Incident case with an NTE out, for Diana (not a demo login).
  const diana = by.get("EMP-0010");
  const title = "Unauthorized absence, three consecutive days";
  if (diana && !(await prisma.grievanceCase.findFirst({ where: { employeeId: diana.id, title } }))) {
    const issued = new Date(Date.now() - 2 * DAY);
    await prisma.grievanceCase.create({
      data: {
        employeeId: diana.id,
        raisedById: hr?.id ?? null,
        type: "INCIDENT",
        title,
        description: "Did not report for work and did not notify her supervisor for three consecutive working days. Attendance logs and the supervisor's report are attached to the file.",
        status: "NTE_ISSUED",
        nteIssuedAt: issued,
        nteDueAt: new Date(`${inDays(3).toISOString().slice(0, 10)}T23:59:59+08:00`),
        events: {
          create: [
            { actorId: hr?.id ?? null, action: "created", createdAt: new Date(issued.getTime() - DAY) },
            {
              actorId: hr?.id ?? null,
              action: "nte.issued",
              createdAt: issued,
              note: "You were absent without leave or notice on three consecutive working days. This may violate Section 4.2 of the Code of Conduct (Attendance and Punctuality), which carries a sanction of up to suspension for a first offense.",
            },
          ],
        },
      },
    });
  }

  // Documents with expiry dates.
  const docs: [string, "ID" | "CONTRACT" | "CERTIFICATE", string, number][] = [
    ["EMP-0006", "ID", "NBI clearance.pdf", -10],
    ["EMP-0005", "CONTRACT", "Project-based contract.pdf", 20],
    ["EMP-0004", "CERTIFICATE", "AWS certification.pdf", 200],
  ];
  for (const [code, category, name, days] of docs) {
    const e = by.get(code);
    if (!e || (await prisma.document.findFirst({ where: { employeeId: e.id, name } }))) continue;
    const data = Buffer.from(`%PDF-1.4\n% ${name} (demo)\n%%EOF\n`);
    await prisma.document.create({
      data: { employeeId: e.id, category, name, mimeType: "application/pdf", size: data.length, data, sha256: createHash("sha256").update(data).digest("hex"), uploadedById: hr?.id ?? null, expiresAt: inDays(days) },
    });
  }
}
