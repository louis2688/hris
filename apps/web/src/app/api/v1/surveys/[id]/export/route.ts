import { handler } from "@/server/api";
import { surveyCsv } from "@/server/services/surveys";

/** GET /api/v1/surveys/:id/export -> CSV of answers (HR/Admin). Anonymous surveys carry no names, dates or small-department labels. */
export const GET = handler<{ id: string }>(
  async ({ params }) => {
    const { filename, csv } = await surveyCsv(params.id);
    return new Response(`﻿${csv}`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
    });
  },
  { roles: ["ADMIN", "HR"] },
);
