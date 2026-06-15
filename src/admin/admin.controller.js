const prisma = require("../prisma");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { mockSendEmail } = require("../utils/mailer");

// =====================
// GET SYSTEM STATS
// =====================
exports.getSystemStats = async (req, res, next) => {
  try {
    const [companiesCount, activeCompaniesCount, usersCount, revenueAgg] = await Promise.all([
      prisma.companies.count(),
      prisma.companies.count({ where: { is_active: true } }),
      prisma.users.count(),
      prisma.company_subscriptions.aggregate({
        _sum: { amount: true },
        where: { status: "ACTIVE" }
      })
    ]);

    res.json({
      total_companies: companiesCount,
      active_companies: activeCompaniesCount,
      total_users: usersCount,
      total_mrr: Number(revenueAgg._sum.amount || 0)
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// GET COMPANIES
// =====================
exports.getCompanies = async (req, res, next) => {
  try {
    const companies = await prisma.companies.findMany({
      include: {
        features: true,
        subscriptions: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { created_at: 'desc' }
        },
        _count: {
          select: { memberships: true, vehicles: true }
        }
      },
      orderBy: { created_at: "desc" },
    });

    res.json({
      total: companies.length,
      items: companies,
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// GET COMPANY BY ID
// =====================
exports.getCompanyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const company = await prisma.companies.findUnique({
      where: { id },
      include: {
        features: true,
        subscriptions: {
          orderBy: { created_at: "desc" },
        },
        memberships: {
          include: {
            users: {
              select: { id: true, full_name: true, email: true, phone: true, role: true, is_active: true, last_login_at: true }
            }
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Format memberships
    const formattedMemberships = company.memberships.map(cu => ({
      ...cu.users,
      company_role: cu.company_role
    }));

    res.json({
      ...company,
      memberships: formattedMemberships,
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// COMPANY PAYMENTS & INVOICES
// =====================
exports.getCompanyPayments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payments = await prisma.company_payments.findMany({
      where: { company_id: id },
      orderBy: { payment_date: "desc" }
    });
    res.json(payments);
  } catch (error) {
    next(error);
  }
};

exports.addCompanyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, currency, payment_date, payment_method, reference_number, notes } = req.body;

    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ message: "Company not found" });

    // Generate Invoice Number (e.g., INV-LOG-2026-0001)
    const invoice_number = `INV-LOG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const payment = await prisma.company_payments.create({
      data: {
        company_id: id,
        amount: Number(amount),
        currency: currency || "EGP",
        payment_date: new Date(payment_date),
        payment_method: payment_method || "CASH",
        reference_number,
        notes,
        invoice_number
      }
    });

    res.json(payment);
  } catch (error) {
    next(error);
  }
};

exports.renderInvoice = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const payment = await prisma.company_payments.findUnique({
      where: { id: paymentId, company_id: id },
      include: { companies: true }
    });

    if (!payment) return res.status(404).send("Invoice not found");

    const html = `
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>فاتورة ${payment.invoice_number}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background: #f8fafc; }
          .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); font-size: 16px; line-height: 24px; background: #fff; border-radius: 8px; }
          .invoice-box table { width: 100%; line-height: inherit; text-align: right; border-collapse: collapse; }
          .invoice-box table td { padding: 12px; vertical-align: top; }
          .invoice-box table tr.top table td { padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
          .title { font-size: 32px; font-weight: bold; color: #1e293b; }
          .header-details { text-align: left; }
          .invoice-box table tr.heading td { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; font-weight: bold; color: #334155; }
          .invoice-box table tr.item td { border-bottom: 1px solid #e2e8f0; }
          .invoice-box table tr.total td { border-top: 2px solid #1e293b; font-weight: bold; font-size: 20px; }
          .print-btn { display: block; width: 100px; margin: 20px auto; padding: 10px; background: #3b82f6; color: white; text-align: center; border-radius: 4px; cursor: pointer; border: none; font-size: 16px; }
          @media print { .print-btn { display: none; } body { background: #fff; padding: 0; } .invoice-box { box-shadow: none; border: none; } }
        </style>
      </head>
      <body>
        <button class="print-btn" onclick="window.print()">طباعة / PDF</button>
        <div class="invoice-box">
          <table cellpadding="0" cellspacing="0">
            <tr class="top">
              <td colspan="2">
                <table>
                  <tr>
                    <td class="title">الوفاق للحلول اللوجستية</td>
                    <td class="header-details">
                      <strong>الفاتورة #:</strong> ${payment.invoice_number}<br>
                      <strong>التاريخ:</strong> ${payment.payment_date.toISOString().split('T')[0]}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr class="information">
              <td colspan="2">
                <table>
                  <tr>
                    <td>
                      <strong>إلى:</strong><br>
                      ${payment.companies.name}<br>
                      كود الشركة: ${payment.companies.code}
                    </td>
                    <td class="header-details">
                      <strong>من:</strong><br>
                      شركة الوفاق - منصة اللوجستيات<br>
                      الرياض، المملكة العربية السعودية
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr class="heading">
              <td>البيان</td>
              <td>المبلغ</td>
            </tr>
            <tr class="item">
              <td>اشتراك النظام (${payment.payment_method}) ${payment.reference_number ? `- مرجع: ${payment.reference_number}` : ''}</td>
              <td>${payment.amount} ${payment.currency}</td>
            </tr>
            <tr class="total">
              <td></td>
              <td>الإجمالي: ${payment.amount} ${payment.currency}</td>
            </tr>
          </table>
          ${payment.notes ? `<p style="margin-top: 30px; font-size: 14px; color: #64748b;"><strong>ملاحظات:</strong> ${payment.notes}</p>` : ''}
          <p style="margin-top: 40px; text-align: center; font-size: 14px; color: #94a3b8;">شكراً لتعاملكم معنا.</p>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    next(error);
  }
};

// =====================
// ADD COMPANY
// =====================
exports.addCompany = async (req, res, next) => {
  try {
    const { name, code, admin_email, admin_name, admin_phone, admin_password } = req.body;

    // Start a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create company
      const company = await tx.companies.create({
        data: {
          name,
          code,
          features: {
            create: {
              fleet_enabled: true,
              inventory_enabled: true,
              custody_enabled: false
            }
          }
        }
      });

      // 2. Hash password
      const hashedPassword = await bcrypt.hash(admin_password, 10);

      // 3. Create admin user
      const user = await tx.users.create({
        data: {
          full_name: admin_name,
          email: admin_email,
          phone: admin_phone,
          password_hash: hashedPassword,
          role: "ADMIN",
          platform_role: "USER"
        }
      });

      // 4. Link user to company
      await tx.company_users.create({
        data: {
          company_id: company.id,
          user_id: user.id,
          company_role: "ADMIN"
        }
      });

      // 5. Create default subscription
      await tx.company_subscriptions.create({
        data: {
          company_id: company.id,
          plan_code: "DEFAULT",
          status: "ACTIVE",
          starts_at: new Date(),
          amount: 0
        }
      });

      return company;
    });

    // Send mock welcome email
    mockSendEmail({
      to: admin_email,
      subject: "Welcome to Logistics System",
      html: `
        <h1>Welcome ${admin_name}!</h1>
        <p>Your company <b>${name}</b> has been successfully created.</p>
        <p>Your admin credentials are:</p>
        <ul>
          <li>Email: ${admin_email}</li>
          <li>Password: ${admin_password}</li>
        </ul>
        <p>Please login and change your password.</p>
      `
    }).catch(console.error);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// =====================
// UPDATE COMPANY
// =====================
exports.updateCompany = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, is_active } = req.body;
    
    const updated = await prisma.companies.update({
      where: { id },
      data: { name, is_active }
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// =====================
// UPDATE FEATURES
// =====================
exports.updateFeatures = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fleet_enabled, inventory_enabled, custody_enabled, fuel_enabled } = req.body;

    const features = await prisma.company_features.upsert({
      where: { company_id: id },
      update: { fleet_enabled, inventory_enabled, custody_enabled, fuel_enabled },
      create: {
        company_id: id,
        fleet_enabled,
        inventory_enabled,
        custody_enabled,
        fuel_enabled
      }
    });

    res.json(features);
  } catch (error) {
    next(error);
  }
};

// =====================
// UPDATE SUBSCRIPTION
// =====================
exports.updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan_code, amount, max_users, max_vehicles, ends_at } = req.body;

    // Mark previous active subscriptions as CANCELED or leave them?
    // Let's just create a new active subscription
    await prisma.company_subscriptions.updateMany({
      where: { company_id: id, status: "ACTIVE" },
      data: { status: "CANCELED", ends_at: new Date() }
    });

    const sub = await prisma.company_subscriptions.create({
      data: {
        company_id: id,
        plan_code: plan_code || "CUSTOM",
        status: "ACTIVE",
        starts_at: new Date(),
        ends_at: ends_at ? new Date(ends_at) : null,
        amount: amount ? Number(amount) : 0,
        max_users: max_users ? Number(max_users) : null,
        max_vehicles: max_vehicles ? Number(max_vehicles) : null
      }
    });

    res.json(sub);
  } catch (error) {
    next(error);
  }
};

// =====================
// IMPERSONATE
// =====================
exports.impersonateCompany = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    
    // Check if company exists
    const company = await prisma.companies.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return res.status(404).json({ message: "Company not found." });
    }

    // Get super admin's real name
    const me = await prisma.users.findUnique({
      where: { id: req.user.sub }
    });

    const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
    
    // Generate an impersonation token using Super Admin's ID but with the company's context
    const token = jwt.sign(
      {
        sub: req.user.sub, // Keep the real user id
        role: "ADMIN", // Assume ADMIN role for the company
        effective_role: "ADMIN",
        platform_role: "SUPER_ADMIN", // Keep SUPER_ADMIN so they can return
        is_impersonating: true,
        company_id: companyId,
        company_name: company.name,
        email: req.user.email,
        full_name: me?.full_name
      },
      JWT_SECRET,
      { expiresIn: "4h" }
    );

    res.json({
      token,
      company,
      user: {
        id: req.user.sub,
        full_name: me?.full_name || "Super Admin",
        role: "ADMIN",
        effective_role: "ADMIN",
        platform_role: "SUPER_ADMIN",
        is_impersonating: true,
        company_id: companyId,
        company_name: company.name,
        email: req.user.email
      }
    });
  } catch (error) {
    next(error);
  }
};

// =====================
// TOGGLE COMPANY (Legacy support if still used)
// =====================
exports.toggleCompanyStatus = async (req, res, next) => {
  try {
    const companyId = req.params.id;
    const company = await prisma.companies.findUnique({ where: { id: companyId } });
    if (!company) throw new Error("Company not found");

    const updated = await prisma.companies.update({
      where: { id: companyId },
      data: { is_active: !company.is_active },
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

exports.getCompanyStats = async (req, res, next) => {
  try {
    const companyId = req.params.id;
    const [tripsCount, driversCount, vehiclesCount, revenue] = await Promise.all([
      prisma.trips.count({ where: { company_id: companyId } }),
      prisma.drivers.count({ where: { company_id: companyId } }),
      prisma.vehicles.count({ where: { company_id: companyId } }),
      prisma.trip_revenues.aggregate({
        where: { company_id: companyId, status: "APPROVED" },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      trips: tripsCount,
      drivers: driversCount,
      vehicles: vehiclesCount,
      revenue: Number(revenue._sum.amount || 0),
    });
  } catch(error) {
    next(error);
  }
};

// =====================
// UPDATE FEATURES
// =====================
exports.updateFeatures = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fleet_enabled, inventory_enabled, custody_enabled, fuel_enabled } = req.body;

    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const updated = await prisma.company_features.upsert({
      where: { company_id: id },
      create: { company_id: id, fleet_enabled, inventory_enabled, custody_enabled, fuel_enabled },
      update: { fleet_enabled, inventory_enabled, custody_enabled, fuel_enabled }
    });

    res.json({ message: "Features updated", features: updated });
  } catch (error) {
    next(error);
  }
};

// =====================
// UPDATE SUBSCRIPTION
// =====================
exports.updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { plan_code, starts_at, ends_at, status } = req.body;

    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const activeSub = await prisma.company_subscriptions.findFirst({
      where: { company_id: id },
      orderBy: { created_at: "desc" }
    });

    if (activeSub) {
      const updated = await prisma.company_subscriptions.update({
        where: { id: activeSub.id },
        data: { 
          plan_code, 
          starts_at: starts_at ? new Date(starts_at) : activeSub.starts_at,
          ends_at: ends_at ? new Date(ends_at) : activeSub.ends_at, 
          status 
        }
      });
      return res.json({ message: "Subscription updated", subscription: updated });
    } else {
      const created = await prisma.company_subscriptions.create({
        data: {
          company_id: id,
          plan_code: plan_code || "BASIC",
          status: status || "ACTIVE",
          starts_at: starts_at ? new Date(starts_at) : new Date(),
          ends_at: ends_at ? new Date(ends_at) : null
        }
      });
      return res.status(201).json({ message: "Subscription created", subscription: created });
    }
  } catch (error) {
    next(error);
  }
};

// =====================
// GET PAYMENTS
// =====================
exports.getCompanyPayments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const payments = await prisma.company_payments.findMany({
      where: { company_id: id },
      orderBy: { payment_date: "desc" }
    });
    res.json({ items: payments });
  } catch (error) {
    next(error);
  }
};

// =====================
// ADD PAYMENT & ISSUE INVOICE
// =====================
exports.addCompanyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, currency, payment_date, payment_method, notes } = req.body;

    const company = await prisma.companies.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ message: "Company not found" });

    const invoiceNumber = `INV-${id.substring(0,4).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    const payment = await prisma.company_payments.create({
      data: {
        company_id: id,
        amount,
        currency: currency || "EGP",
        payment_date: payment_date ? new Date(payment_date) : new Date(),
        payment_method: payment_method || "CASH",
        notes,
        invoice_number: invoiceNumber
      }
    });

    // MOCK EMAIL SENDING
    console.log(`[EMAIL SIMULATION] Sending Invoice ${invoiceNumber} to ${company.email || 'company admin'}`);
    console.log(`[EMAIL CONTENT] Receipt for ${amount} ${currency}. Method: ${payment_method}. Notes: ${notes}`);

    res.status(201).json({ message: "Payment added and invoice generated", payment, emailSent: true });
  } catch (error) {
    next(error);
  }
};

// =====================
// RENDER INVOICE (TEXT)
// =====================
exports.renderInvoice = async (req, res, next) => {
  try {
    const { id, paymentId } = req.params;
    const payment = await prisma.company_payments.findFirst({
      where: { id: paymentId, company_id: id },
      include: { companies: true }
    });

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    const invoiceText = `
=========================================
          INVOICE / RECEIPT
=========================================
Invoice Number: ${payment.invoice_number}
Date: ${new Date(payment.payment_date).toLocaleDateString()}

Company: ${payment.companies.name}
Code: ${payment.companies.code}
-----------------------------------------
Amount Paid: ${payment.amount} ${payment.currency}
Payment Method: ${payment.payment_method}
Notes: ${payment.notes || 'N/A'}
=========================================
Thank you for your business!
`;

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="invoice_${payment.invoice_number}.txt"`);
    res.send(invoiceText.trim());
  } catch (error) {
    next(error);
  }
};