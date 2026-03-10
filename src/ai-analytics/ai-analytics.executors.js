/**
 * TREX AI Action Executors
 *
 * IMPORTANT:
 * هذه الطبقة هي نقطة الربط الفعلية بين الـ AI وبين Modules النظام.
 * حالياً تم تجهيز adapters آمنة. يجب استبدال محتوى الدوال
 * createMaintenanceRequestExecutor / createWorkOrderExecutor / createExpenseExecutor
 * بالاستدعاءات الحقيقية الموجودة عندك في النظام.
 *
 * مثال لاحقًا:
 * - maintenanceService.createRequest(...)
 * - maintenanceService.createWorkOrder(...)
 * - financeService.createExpense(...)
 */

function notImplemented(name, payload) {
  return {
    ok: false,
    executed: false,
    executor: name,
    message: `Executor "${name}" is not connected yet.`,
    payload,
  };
}

/**
 * تنفيذ إنشاء طلب صيانة
 * اربطها لاحقًا بالدالة الحقيقية في module الصيانة.
 */
async function createMaintenanceRequestExecutor({ user, payload }) {
  // TODO:
  // استبدل هذا الجزء بالربط الحقيقي.
  // مثال تخيلي:
  // const result = await maintenanceService.createRequest({
  //   requested_by: user?.sub,
  //   vehicle_hint: payload.vehicle_hint,
  //   description: payload.description,
  // });
  // return { ok: true, executed: true, data: result };

  return notImplemented("createMaintenanceRequestExecutor", payload);
}

/**
 * تنفيذ إنشاء أمر عمل
 * اربطها لاحقًا بالدالة الحقيقية في module الصيانة.
 */
async function createWorkOrderExecutor({ user, payload }) {
  // TODO:
  // استبدل هذا الجزء بالربط الحقيقي.
  // مثال تخيلي:
  // const result = await maintenanceService.createWorkOrder({
  //   created_by: user?.sub,
  //   vehicle_hint: payload.vehicle_hint,
  //   title: payload.title,
  // });
  // return { ok: true, executed: true, data: result };

  return notImplemented("createWorkOrderExecutor", payload);
}

/**
 * تنفيذ تسجيل مصروف
 * اربطها لاحقًا بالدالة الحقيقية في module المالية.
 */
async function createExpenseExecutor({ user, payload }) {
  // TODO:
  // استبدل هذا الجزء بالربط الحقيقي.
  // مثال تخيلي:
  // const result = await financeService.createExpense({
  //   created_by: user?.sub,
  //   amount: payload.amount,
  //   expense_type: payload.expense_type,
  //   vehicle_hint: payload.vehicle_hint || null,
  // });
  // return { ok: true, executed: true, data: result };

  return notImplemented("createExpenseExecutor", payload);
}

async function runAiExecutor({ action, user, payload }) {
  if (action === "create_maintenance_request") {
    return createMaintenanceRequestExecutor({ user, payload });
  }

  if (action === "create_work_order") {
    return createWorkOrderExecutor({ user, payload });
  }

  if (action === "create_expense") {
    return createExpenseExecutor({ user, payload });
  }

  return {
    ok: false,
    executed: false,
    message: `Unsupported executor action: ${action}`,
    payload,
  };
}

module.exports = {
  runAiExecutor,
  createMaintenanceRequestExecutor,
  createWorkOrderExecutor,
  createExpenseExecutor,
};