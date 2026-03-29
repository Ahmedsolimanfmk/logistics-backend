const prisma = require("../maintenance/prisma");
const { getUserId } = require("../auth/access");

// =======================
// LIST
// =======================
async function listIssues(req, res) {
try {
const companyId = req.companyId;

```
const rows = await prisma.inventory_issues.findMany({
  where: { company_id: companyId },
  orderBy: [{ created_at: "desc" }],
  include: {
    warehouses: true,
    requests: true,
    inventory_issue_lines: {
      include: { parts: true, part_items: true },
    },
  },
});

res.json({ items: rows });
```

} catch (err) {
console.error(err);
res.status(500).json({ message: "Failed to list issues" });
}
}

// =======================
// GET ONE
// =======================
async function getIssue(req, res) {
try {
const companyId = req.companyId;
const id = req.params.id;

```
const row = await prisma.inventory_issues.findFirst({
  where: {
    id,
    company_id: companyId,
  },
  include: {
    warehouses: true,
    requests: true,
    inventory_issue_lines: {
      include: { parts: true, part_items: true },
    },
  },
});

if (!row) return res.status(404).json({ message: "Issue not found" });

res.json(row);
```

} catch (err) {
res.status(500).json({ message: "Failed" });
}
}

// =======================
// CREATE DRAFT
// =======================
async function createIssueDraft(req, res) {
try {
const companyId = req.companyId;
const created_by = getUserId(req);

```
const warehouse_id = req.body?.warehouse_id || null;
const request_id = req.body?.request_id || null;

const created = await prisma.inventory_issues.create({
  data: {
    company_id: companyId,
    warehouse_id,
    request_id,
    status: "DRAFT",
    created_by: created_by || null,
  },
});

res.status(201).json(created);
```

} catch (err) {
console.error("createIssueDraft error:", err);
res.status(500).json({ message: "Failed to create issue draft" });
}
}

// =======================
// POST ISSUE
// =======================
async function postIssue(req, res) {
try {
const companyId = req.companyId;
const id = req.params.id;

```
const updated = await prisma.inventory_issues.update({
  where: { id },
  data: {
    status: "POSTED",
    posted_at: new Date(),
  },
});

res.json(updated);
```

} catch (err) {
console.error("postIssue error:", err);
res.status(500).json({ message: "Failed to post issue" });
}
}

module.exports = {
listIssues,
getIssue,
createIssueDraft,
postIssue,
};
