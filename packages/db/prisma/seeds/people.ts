/**
 * People ops demo data: announcements (one pinned policy needing ack), default onboarding/offboarding
 * templates, an onboarding checklist for the newest hire, and ~10 assets. Idempotent (natural keys).
 */
import type { PrismaClient } from "../../generated/prisma/client.js";

type Owner = "HR" | "MANAGER" | "EMPLOYEE" | "IT";
const DAY = 86_400_000;

const ONBOARDING: [string, Owner, number][] = [
  ["Sign employment contract and NDA", "HR", 0],
  ["Submit SSS, PhilHealth, Pag-IBIG and TIN numbers", "EMPLOYEE", 3],
  ["Submit BIR Form 2316 from previous employer", "EMPLOYEE", 7],
  ["Issue laptop and peripherals", "IT", 0],
  ["Create company email and system accounts", "IT", 0],
  ["New hire orientation", "HR", 1],
  ["Assign an onboarding buddy", "MANAGER", 1],
  ["30-day check-in with manager", "MANAGER", 30],
];
const OFFBOARDING: [string, Owner, number][] = [
  ["Exit interview", "HR", 5],
  ["Return company assets", "EMPLOYEE", 1],
  ["Clearance sign-off from all departments", "HR", 1],
  ["Final pay computation", "HR", 0],
  ["Issue Certificate of Employment (COE)", "HR", 0],
  ["Revoke system access and email", "IT", 0],
];

const POLICY_BODY = `We have updated our **Code of Conduct** and **Data Privacy Policy** to align with the Data Privacy Act of 2012 (RA 10173).

Key changes:
- Customer and employee personal data may only be accessed for a clear business purpose
- Report suspected data breaches to HR or IT **within 24 hours**
- Personal devices used for work must have a screen lock and encryption turned on

Please read the full policy on the [company handbook](https://example.com/handbook) and acknowledge below by the end of the month.`;

const TOWN_HALL_BODY = `Join us for the Q4 town hall this Friday at 4:00 PM in the Ortigas Center main hall. Cebu Office colleagues can join via the usual video link.

Agenda:
1. Company results so far
2. Year-end calendar and holiday schedule
3. Open forum

Snacks are on us.`;

export async function seedPeople(prisma: PrismaClient) {
  const hr = await prisma.user.findUnique({ where: { email: "hr@hris.local" }, select: { id: true } });
  const emp = (code: string) => prisma.employee.findUnique({ where: { employeeCode: code }, select: { id: true, firstName: true, lastName: true } });

  // ---- Announcements ----
  const ann = async (title: string, body: string, pinned: boolean, requiresAck: boolean, daysAgo: number) => {
    if (await prisma.announcement.findFirst({ where: { title } })) return;
    await prisma.announcement.create({ data: { title, body, pinned, requiresAck, authorId: hr?.id, publishedAt: new Date(Date.now() - daysAgo * DAY) } });
  };
  await ann("Updated Code of Conduct and Data Privacy Policy", POLICY_BODY, true, true, 2);
  await ann("Q4 town hall this Friday", TOWN_HALL_BODY, false, false, 1);

  // ---- Checklist templates ----
  const template = async (name: string, kind: "ONBOARDING" | "OFFBOARDING", items: [string, Owner, number][]) => {
    const found = await prisma.checklistTemplate.findFirst({ where: { name }, include: { items: true } });
    if (found) return found;
    const hasDefault = await prisma.checklistTemplate.count({ where: { kind, isDefault: true } });
    return prisma.checklistTemplate.create({
      data: { name, kind, isDefault: !hasDefault, items: { create: items.map(([title, owner, dueOffsetDays], sortOrder) => ({ title, owner, dueOffsetDays, sortOrder })) } },
      include: { items: true },
    });
  };
  const onboarding = await template("Standard onboarding (PH)", "ONBOARDING", ONBOARDING);
  await template("Standard offboarding (PH)", "OFFBOARDING", OFFBOARDING);

  // ---- Onboarding checklist for the newest hire (first two tasks already done) ----
  const newest = await prisma.employee.findFirst({ where: { deletedAt: null, employmentStatus: { notIn: ["RESIGNED", "TERMINATED"] } }, orderBy: { hireDate: "desc" }, select: { id: true, hireDate: true } });
  if (newest && !(await prisma.employeeChecklist.count({ where: { employeeId: newest.id, kind: "ONBOARDING" } }))) {
    const items = [...onboarding.items].sort((a, b) => a.sortOrder - b.sortOrder);
    await prisma.employeeChecklist.create({
      data: {
        employeeId: newest.id,
        kind: "ONBOARDING",
        templateId: onboarding.id,
        startedAt: newest.hireDate,
        tasks: {
          create: items.map((it, n) => ({
            title: it.title,
            owner: it.owner,
            sortOrder: n,
            dueDate: new Date(newest.hireDate.getTime() + it.dueOffsetDays * DAY),
            ...(n < 2 ? { doneAt: new Date(newest.hireDate.getTime() + DAY), doneById: hr?.id } : {}),
          })),
        },
      },
    });
  }

  // ---- Assets ----
  const assets: { tag: string; name: string; category: string; serial: string; cost: string; bought: string; to?: string; status?: "REPAIR" | "RETIRED" }[] = [
    { tag: "LPT-0001", name: 'MacBook Pro 14" M3', category: "Laptop", serial: "C02XK1ABMD6T", cost: "119990.00", bought: "2024-02-12", to: "EMP-0004" },
    { tag: "LPT-0002", name: 'MacBook Pro 14" M3', category: "Laptop", serial: "C02XK1ABMD7Q", cost: "119990.00", bought: "2024-02-12", to: "EMP-0003" },
    { tag: "LPT-0003", name: "Lenovo ThinkPad T14 Gen 4", category: "Laptop", serial: "PF4ABC12", cost: "78500.00", bought: "2025-06-03", to: "EMP-0012" },
    { tag: "LPT-0004", name: "Lenovo ThinkPad T14 Gen 4", category: "Laptop", serial: "PF4ABC19", cost: "78500.00", bought: "2025-06-03" },
    { tag: "LPT-0005", name: "Dell Latitude 5440", category: "Laptop", serial: "8QZ1LX3", cost: "64990.00", bought: "2023-09-18", status: "REPAIR" },
    { tag: "PHN-0001", name: "iPhone 15 128GB", category: "Phone", serial: "F2LXQ0ABCD12", cost: "56990.00", bought: "2024-10-01", to: "EMP-0004" },
    { tag: "PHN-0002", name: "Samsung Galaxy A55", category: "Phone", serial: "R58W21ABCDE", cost: "23990.00", bought: "2025-01-15", to: "EMP-0009" },
    { tag: "MON-0001", name: 'Dell UltraSharp 27" U2723QE', category: "Monitor", serial: "CN0ABC12345", cost: "32500.00", bought: "2024-03-05", to: "EMP-0005" },
    { tag: "MON-0002", name: 'Dell UltraSharp 27" U2723QE', category: "Monitor", serial: "CN0ABC12399", cost: "32500.00", bought: "2024-03-05" },
    { tag: "MON-0003", name: 'LG 24" 24MK430H', category: "Monitor", serial: "905NTAB1234", cost: "7990.00", bought: "2019-08-20", status: "RETIRED" },
  ];
  for (const a of assets) {
    if (await prisma.asset.findUnique({ where: { tag: a.tag }, select: { id: true } })) continue;
    const e = a.to ? await emp(a.to) : null;
    const to = e?.id ?? null;
    const row = await prisma.asset.create({
      data: {
        tag: a.tag, name: a.name, category: a.category, serialNumber: a.serial, cost: a.cost, purchaseDate: new Date(a.bought),
        status: to ? "ASSIGNED" : (a.status ?? "AVAILABLE"), assignedToId: to, assignedAt: to ? new Date(a.bought) : null,
      },
    });
    await prisma.auditLog.create({ data: { actorUserId: hr?.id, action: "asset.create", entity: "Asset", entityId: row.id, after: { tag: a.tag, name: a.name } } });
    if (to) await prisma.auditLog.create({ data: { actorUserId: hr?.id, action: "asset.assign", entity: "Asset", entityId: row.id, after: { employeeId: to, to: `${e!.firstName} ${e!.lastName}` } } });
  }
}
