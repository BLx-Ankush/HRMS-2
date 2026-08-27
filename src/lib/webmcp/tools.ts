// Admin WebMCP tools for the HRMS console.
//
// Each tool reuses the same Supabase logic the UI hooks use (src/hooks/hrms.ts)
// so agent actions and human actions go through identical paths and the live
// React Query cache updates the moment a tool runs. Mutating tools require
// human approval (see approval.ts).
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import type { McpToolDescriptor } from "./types";
import { textResult, jsonResult } from "./registry";
import { requireApproval } from "./approval";
import { canvas } from "./canvas";
import {
  extractDepartment, extractEmail, extractEmployeeId, extractJoinDate, extractName,
  extractPhone, extractPosition, extractSkills, extractStatus,
  emailFromName, inferDomain, nextEmployeeId, normalizeDepartment, today,
} from "./parseEmployee";

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const invalidate = (qc: QueryClient, keys: string[][]) =>
  keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));

async function logActivity(type: string, actorName: string, action: string) {
  await supabase.from("activities").insert({ type, actor_name: actorName, action });
}

// Object schema helper (JSON Schema draft-07 subset the API expects).
const obj = (
  properties: Record<string, unknown>,
  required: string[] = []
): Record<string, unknown> => ({ type: "object", properties, required, additionalProperties: false });

const str = (description: string) => ({ type: "string", description });
const strEnum = (description: string, values: string[]) => ({ type: "string", description, enum: values });

const STATUS_VALUES = ["active", "on_leave", "inactive"];

export function buildAdminTools(qc: QueryClient): McpToolDescriptor[] {
  return [
    // ---------------- Reads ----------------
    {
      name: "list_employees",
      title: "List employees",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "List employees in the HRMS directory. Optionally filter by a free-text query (matches name, email, employee ID, position), department, or status.",
      inputSchema: obj({
        query: str("Free-text search across name, email, employee ID, and position."),
        department: str("Exact department name to filter by, e.g. 'Engineering'."),
        status: strEnum("Employment status filter.", STATUS_VALUES),
      }),
      execute: async (args) => {
        const { data, error } = await supabase.from("profiles").select("*").order("employee_id");
        if (error) throw error;
        let rows = data ?? [];
        const q = s(args.query).toLowerCase();
        if (q)
          rows = rows.filter((r: any) =>
            [r.name, r.email, r.employee_id, r.position]
              .map((v) => String(v ?? "").toLowerCase())
              .some((v) => v.includes(q))
          );
        const dept = s(args.department).toLowerCase();
        if (dept) rows = rows.filter((r: any) => String(r.department ?? "").toLowerCase() === dept);
        const status = s(args.status);
        if (status) rows = rows.filter((r: any) => r.status === status);
        const slim = rows.map((r: any) => ({
          employeeId: r.employee_id, name: r.name, email: r.email, phone: r.phone,
          department: r.department, position: r.position, status: r.status, joinDate: r.join_date,
        }));
        return jsonResult({ count: slim.length, employees: slim });
      },
    },
    {
      name: "get_employee",
      title: "Get employee profile",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description: "Fetch a single employee's full profile by employee ID (e.g. 'EMP003').",
      inputSchema: obj({ employeeId: str("The employee ID to look up.") }, ["employeeId"]),
      execute: async (args) => {
        const id = s(args.employeeId);
        if (!id) return { ...textResult("employeeId is required."), isError: true };
        const { data, error } = await supabase.from("profiles").select("*").eq("employee_id", id).maybeSingle();
        if (error) throw error;
        if (!data) return { ...textResult(`No employee found with ID ${id}.`), isError: true };
        return jsonResult(data);
      },
    },
    {
      name: "list_leave_requests",
      title: "List leave requests",
      annotations: { readOnlyHint: true, idempotentHint: true },
      description:
        "List leave requests. Optionally filter by status (pending/approved/rejected). Use this to find the requestId before approving or rejecting.",
      inputSchema: obj({
        status: strEnum("Filter by request status.", ["pending", "approved", "rejected"]),
      }),
      execute: async (args) => {
        let query = supabase.from("leave_requests").select("*").order("applied_on", { ascending: false });
        const status = s(args.status);
        if (status) query = query.eq("status", status);
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []).map((r: any) => ({
          requestId: r.id, employeeId: r.employee_id, employeeName: r.employee_name, type: r.type,
          startDate: r.start_date, endDate: r.end_date, days: r.days, reason: r.reason,
          status: r.status, appliedOn: r.applied_on,
        }));
        return jsonResult({ count: rows.length, requests: rows });
      },
    },
    // ---------------- Writes (human-approval gated) ----------------
    {
      name: "add_employee",
      title: "Add employee",
      annotations: { destructiveHint: false },
      description:
        "Add a new employee to the roster. Drafts the record and asks the admin to confirm before saving. Requires employeeId, name, email, department, and position.",
      inputSchema: obj(
        {
          employeeId: str("Unique employee ID, e.g. 'EMP007'."),
          name: str("Full name."),
          email: str("Work email address."),
          department: str("Department, e.g. 'Engineering'."),
          position: str("Job title, e.g. 'Software Developer'."),
          phone: str("Phone number (optional)."),
          status: strEnum("Employment status (defaults to 'active').", STATUS_VALUES),
          joinDate: str("Join date in YYYY-MM-DD (defaults to today)."),
          address: str("Postal address (optional)."),
          about: str("Short bio / about text (optional)."),
          skills: { type: "array", items: { type: "string" }, description: "List of skills (optional)." },
        },
        ["employeeId", "name", "email", "department", "position"]
      ),
      execute: async (args) => {
        const employeeId = s(args.employeeId).toUpperCase();
        const name = s(args.name);
        const email = s(args.email);
        const department = s(args.department);
        const position = s(args.position);
        if (!employeeId || !name || !email || !department || !position)
          return { ...textResult("Missing required fields (employeeId, name, email, department, position)."), isError: true };

        const status = STATUS_VALUES.includes(s(args.status)) ? s(args.status) : "active";
        const joinDate = s(args.joinDate) || new Date().toISOString().slice(0, 10);
        const skills = Array.isArray(args.skills) ? (args.skills as unknown[]).map((x) => String(x)) : undefined;

        const ok = await requireApproval({
          title: "Add employee",
          summary: `Add ${name} (${employeeId}) to ${department}`,
          details: {
            "Employee ID": employeeId, Name: name, Email: email,
            Department: department, Position: position, Status: status, "Join date": joinDate,
            ...(s(args.phone) ? { Phone: s(args.phone) } : {}),
          },
          confirmLabel: "Add employee",
        });
        if (!ok) return textResult(`Cancelled — ${name} was not added.`);

        const { error } = await supabase.from("profiles").insert({
          employee_id: employeeId, name, email, phone: s(args.phone), department, position,
          status, join_date: joinDate, role: "employee",
          ...(s(args.address) ? { address: s(args.address) } : {}),
          ...(s(args.about) ? { about: s(args.about) } : {}),
          ...(skills ? { skills } : {}),
        });
        if (error) {
          const dup = /duplicate|unique/i.test(error.message);
          return { ...textResult(dup ? `Employee ID ${employeeId} already exists — pick another.` : error.message), isError: true };
        }
        await logActivity("welcome", name, "joined the team");
        invalidate(qc, [["employees"], ["activities"], ["stats"]]);
        canvas.focusEmployee(employeeId); // show the human the row that just appeared
        return textResult(`Added ${name} (${employeeId}) to ${department} as ${position}.`);
      },
    },
    {
      name: "add_employee_from_description",
      title: "Onboard from a description",
      annotations: { destructiveHint: false },
      description:
        "Onboard a new employee from one free-text sentence, e.g. \"add Priya Sharma as a senior backend developer in eng, priya@dayflow.com, starting Sept 15\". Pass the admin's wording as `description` and whatever fields you recognised in it; everything you leave out is derived deterministically against the live roster — the next free employee ID, the department snapped onto one already in use, a house-style work email, and the join date. Duplicates are caught before anything is written, and the admin confirms a draft that marks which values were stated and which were inferred. Prefer this over add_employee whenever the admin describes a hire in prose instead of giving structured fields.",
      inputSchema: obj(
        {
          description: str("The admin's full description of the new hire, in their own words."),
          name: str("Full name, if you can identify it (recommended — pass this explicitly)."),
          position: str("Job title, if identifiable, e.g. 'Senior Backend Developer'."),
          department: str("Department as mentioned; shorthand like 'eng' is normalized."),
          email: str("Work email, if stated. Inferred from the name when omitted."),
          phone: str("Phone number, if stated."),
          joinDate: str("Join date; ISO or loose forms like 'Sept 15' are parsed. Defaults to today."),
          employeeId: str("Only if the admin named one. Otherwise the next free ID is assigned."),
          status: strEnum("Employment status; defaults to 'active'.", STATUS_VALUES),
          skills: { type: "array", items: { type: "string" }, description: "Skills, if mentioned." },
        },
        ["description"]
      ),
      execute: async (args) => {
        const description = s(args.description);
        if (!description)
          return { ...textResult("description is required — pass the admin's wording."), isError: true };

        const { data: roster, error: rosterErr } = await supabase
          .from("profiles").select("employee_id,name,email,department");
        if (rosterErr) throw rosterErr;
        const rows = roster ?? [];
        const knownDepts = Array.from(
          new Set(rows.map((r: any) => String(r.department ?? "").trim()).filter(Boolean))
        );
        const domain = inferDomain(rows.map((r: any) => r.email));

        // Explicit arguments always win; the description is the fallback.
        const name = s(args.name) || extractName(description);
        const position = s(args.position) || extractPosition(description);
        const deptRaw = s(args.department) || extractDepartment(description, knownDepts);

        const missing: string[] = [];
        if (!name) missing.push("name");
        if (!position) missing.push("position");
        if (!deptRaw) missing.push("department");
        if (missing.length)
          return {
            ...textResult(
              `Couldn't determine ${missing.join(", ")} from that description. Nothing was saved — ` +
                `ask the admin for the missing detail, or call this again passing ${missing.join(" and ")} explicitly.`
            ),
            isError: true,
          };

        const dept = normalizeDepartment(deptRaw, knownDepts);
        const department = dept.value;

        const statedId = s(args.employeeId).toUpperCase() || extractEmployeeId(description);
        const employeeId = statedId || nextEmployeeId(rows.map((r: any) => r.employee_id));

        const statedEmail = s(args.email) || extractEmail(description);
        const email = statedEmail || emailFromName(name, domain);

        const statedDate = s(args.joinDate) || extractJoinDate(description);
        const joinDate = statedDate || today();

        const status = STATUS_VALUES.includes(s(args.status))
          ? s(args.status)
          : extractStatus(description) || "active";
        const phone = s(args.phone) || extractPhone(description);
        const skills = Array.isArray(args.skills)
          ? (args.skills as unknown[]).map((x) => String(x))
          : extractSkills(description);

        // Catch collisions before we ask the human to commit to anything.
        const idTaken = rows.find(
          (r: any) => String(r.employee_id ?? "").toUpperCase() === employeeId
        );
        if (idTaken)
          return {
            ...textResult(
              `Employee ID ${employeeId} already belongs to ${idTaken.name}. Nothing was saved — ` +
                `omit employeeId and I'll assign the next free one.`
            ),
            isError: true,
          };
        const emailTaken = rows.find(
          (r: any) => String(r.email ?? "").toLowerCase() === email.toLowerCase()
        );
        if (emailTaken)
          return {
            ...textResult(
              `${email} is already on the roster (${emailTaken.name}, ${emailTaken.employee_id}). ` +
                `Nothing was saved — confirm this isn't a duplicate hire, then supply a different email.`
            ),
            isError: true,
          };
        const sameName = rows.find(
          (r: any) => String(r.name ?? "").trim().toLowerCase() === name.toLowerCase()
        );

        const mark = (value: string, stated: boolean, note?: string) =>
          stated ? value : `${value}  — ${note ?? "inferred"}`;

        const details: Record<string, string> = {
          "Employee ID": mark(employeeId, !!statedId, "next free ID"),
          Name: name,
          Email: mark(email, !!statedEmail, `built from name @${domain}`),
          Department: dept.note ? `${department}  — ${dept.note}` : department,
          Position: position,
          Status: status,
          "Join date": mark(joinDate, !!statedDate, "defaulted to today"),
        };
        if (phone) details.Phone = phone;
        if (skills.length) details.Skills = skills.join(", ");
        details["From"] = description;
        if (sameName)
          details["⚠ Possible duplicate"] =
            `${sameName.name} (${sameName.employee_id}) is already on the roster with this name`;

        const ok = await requireApproval({
          title: "Add employee (from description)",
          summary: `Add ${name} (${employeeId}) to ${department} as ${position}`,
          details,
          confirmLabel: "Add employee",
          destructive: !!sameName,
        });
        if (!ok) return textResult(`Cancelled — ${name} was not added.`);

        const { error } = await supabase.from("profiles").insert({
          employee_id: employeeId, name, email, phone, department, position,
          status, join_date: joinDate, role: "employee",
          ...(skills.length ? { skills } : {}),
        });
        if (error) {
          const dup = /duplicate|unique/i.test(error.message);
          return {
            ...textResult(dup ? `${employeeId} or ${email} was taken while you confirmed — try again.` : error.message),
            isError: true,
          };
        }
        await logActivity("welcome", name, "joined the team");
        invalidate(qc, [["employees"], ["activities"], ["stats"]]);
        canvas.focusEmployee(employeeId); // scroll the new row into view and pulse it

        const derived = [
          !statedId && "employee ID", !statedEmail && "work email",
          !statedDate && "join date", dept.note && "department",
        ].filter(Boolean);
        return textResult(
          `Added ${name} (${employeeId}) to ${department} as ${position}, starting ${joinDate}.` +
            (derived.length ? ` Derived from the roster: ${derived.join(", ")}.` : "")
        );
      },
    },
    {
      name: "update_employee",
      title: "Update employee",
      annotations: { destructiveHint: true },
      description:
        "Update fields on an existing employee. Only the fields you provide are changed. Asks the admin to confirm before saving.",
      inputSchema: obj(
        {
          employeeId: str("Employee ID of the person to update, e.g. 'EMP003'."),
          name: str("New full name."),
          email: str("New work email."),
          phone: str("New phone number."),
          department: str("New department."),
          position: str("New job title."),
          status: strEnum("New employment status.", STATUS_VALUES),
          address: str("New postal address."),
          about: str("New bio / about text."),
        },
        ["employeeId"]
      ),
      execute: async (args) => {
        const employeeId = s(args.employeeId).toUpperCase();
        if (!employeeId) return { ...textResult("employeeId is required."), isError: true };

        const map: Record<string, string> = {
          name: "name", email: "email", phone: "phone", department: "department",
          position: "position", status: "status", address: "address", about: "about",
        };
        const patch: Record<string, unknown> = {};
        const shown: Record<string, string> = {};
        for (const [arg, col] of Object.entries(map)) {
          const v = s(args[arg]);
          if (v) { patch[col] = v; shown[arg] = v; }
        }
        if (Object.keys(patch).length === 0)
          return { ...textResult("No fields to update — provide at least one field besides employeeId."), isError: true };

        const ok = await requireApproval({
          title: "Update employee",
          summary: `Update ${employeeId} (${Object.keys(shown).join(", ")})`,
          details: { "Employee ID": employeeId, ...shown },
          confirmLabel: "Save changes",
        });
        if (!ok) return textResult(`Cancelled — ${employeeId} was not changed.`);

        const { data, error } = await supabase
          .from("profiles").update(patch).eq("employee_id", employeeId).select("employee_id");
        if (error) return { ...textResult(error.message), isError: true };
        if (!data || data.length === 0)
          return { ...textResult(`No employee found with ID ${employeeId}.`), isError: true };
        invalidate(qc, [["employees"], ["stats"]]);
        canvas.focusEmployee(employeeId); // scroll + pulse the row we just changed
        return textResult(`Updated ${employeeId}: ${Object.keys(shown).join(", ")}.`);
      },
    },
    {
      name: "decide_leave",
      title: "Approve or reject leave",
      annotations: { destructiveHint: true },
      description:
        "Approve or reject a pending leave request. Use list_leave_requests first to get the requestId. Asks the admin to confirm the decision.",
      inputSchema: obj(
        {
          requestId: str("The leave request's requestId (from list_leave_requests)."),
          decision: strEnum("Decision to apply.", ["approve", "reject"]),
        },
        ["requestId", "decision"]
      ),
      execute: async (args) => {
        const requestId = s(args.requestId);
        const decision = s(args.decision);
        if (!requestId || !["approve", "reject"].includes(decision))
          return { ...textResult("Provide requestId and decision ('approve' or 'reject')."), isError: true };

        const { data: req, error: findErr } = await supabase
          .from("leave_requests").select("*").eq("id", requestId).maybeSingle();
        if (findErr) throw findErr;
        if (!req) return { ...textResult(`No leave request found with id ${requestId}.`), isError: true };

        const status = decision === "approve" ? "approved" : "rejected";
        // Put the human on the leave screen with THIS row highlighted before we
        // ask them to commit, so they approve something they can actually see.
        canvas.flagLeaveRequests([requestId]);
        const ok = await requireApproval({
          title: `${decision === "approve" ? "Approve" : "Reject"} leave`,
          summary: `${decision === "approve" ? "Approve" : "Reject"} ${req.employee_name}'s ${req.type}`,
          details: {
            Employee: `${req.employee_name} (${req.employee_id})`, Type: req.type,
            Dates: `${req.start_date} → ${req.end_date}`, Days: String(req.days),
            Reason: req.reason ?? "—", Decision: status,
          },
          confirmLabel: decision === "approve" ? "Approve" : "Reject",
          destructive: decision === "reject",
        });
        if (!ok) return textResult(`Cancelled — ${req.employee_name}'s leave was left as ${req.status}.`);

        const { error } = await supabase.from("leave_requests").update({ status }).eq("id", requestId);
        if (error) return { ...textResult(error.message), isError: true };
        await logActivity("leave", req.employee_name, `leave ${status}`);
        invalidate(qc, [["leave_requests"], ["activities"], ["stats"]]);
        return textResult(`${status === "approved" ? "Approved" : "Rejected"} ${req.employee_name}'s ${req.type} (${req.start_date} → ${req.end_date}).`);
      },
    },
  ];
}
