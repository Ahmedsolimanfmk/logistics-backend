const ROLES = Object.freeze({
  ADMIN: "ADMIN",

  // Operations
  FIELD_SUPERVISOR: "FIELD_SUPERVISOR",     // مشرف الرحلة (مسؤول مباشر)
  GENERAL_SUPERVISOR: "GENERAL_SUPERVISOR", // المشرف العام

  // Management
  DEPT_MANAGER: "DEPT_MANAGER",             // مدير الإدارة
  GENERAL_MANAGER: "GENERAL_MANAGER",       // المدير العام
  GENERAL_RESPONSIBLE: "GENERAL_RESPONSIBLE", // المسؤول العام

  // Store
  STOREKEEPER: "STOREKEEPER",   // 

  // existing
  HR: "HR",
  ACCOUNTANT: "ACCOUNTANT",
  DISPATCHER: "DISPATCHER",
});

module.exports = { ROLES };
