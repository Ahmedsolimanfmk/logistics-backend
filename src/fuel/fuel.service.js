// backend/src/fuel/fuel.service.js
const prisma = require("../prisma");

class FuelService {
  // =====================
  // Super Admin: Stations
  // =====================
  async createStation(data) {
    return prisma.fuel_stations.create({ data });
  }

  async listStations() {
    return prisma.fuel_stations.findMany({ orderBy: { created_at: "desc" } });
  }

  async updateStation(id, data) {
    return prisma.fuel_stations.update({ where: { id }, data });
  }

  // =====================
  // Wallet Recharges
  // =====================
  async requestRecharge(company_id, data) {
    return prisma.fuel_wallet_recharges.create({
      data: {
        company_id,
        amount: data.amount,
        payment_method: data.payment_method,
        reference: data.reference,
        notes: data.notes,
        status: "PENDING"
      }
    });
  }

  async listRecharges(company_id) {
    const where = company_id ? { company_id } : {};
    return prisma.fuel_wallet_recharges.findMany({
      where,
      include: { company: { select: { name: true } } },
      orderBy: { created_at: "desc" }
    });
  }

  async approveRecharge(id) {
    return prisma.$transaction(async (tx) => {
      const recharge = await tx.fuel_wallet_recharges.findUnique({ where: { id } });
      if (!recharge || recharge.status !== "PENDING") {
        throw new Error("Invalid or already processed recharge");
      }

      await tx.fuel_wallet_recharges.update({
        where: { id },
        data: { status: "APPROVED" }
      });

      await tx.companies.update({
        where: { id: recharge.company_id },
        data: { fuel_wallet_balance: { increment: recharge.amount } }
      });

      return recharge;
    });
  }

  async rejectRecharge(id) {
    return prisma.fuel_wallet_recharges.update({
      where: { id },
      data: { status: "REJECTED" }
    });
  }

  // =====================
  // Transactions / QR
  // =====================
  async simulateTransaction({ company_id, station_id, vehicle_id, driver_id, amount }) {
    return prisma.$transaction(async (tx) => {
      const company = await tx.companies.findUnique({
        where: { id: company_id },
        include: { features: true }
      });

      if (!company) throw new Error("Company not found");

      if (!company.features?.fuel_enabled) {
        throw new Error("Fuel service is not enabled for this company");
      }

      const commissionPct = company.features.fuel_commission_pct || 1.0;
      const system_commission = (amount * commissionPct) / 100;
      const total_deducted = amount + system_commission;

      if (company.fuel_wallet_balance < total_deducted) {
        throw new Error("Insufficient fuel wallet balance");
      }

      // Deduct from company
      await tx.companies.update({
        where: { id: company_id },
        data: { fuel_wallet_balance: { decrement: total_deducted } }
      });

      // Add to station balance
      await tx.fuel_stations.update({
        where: { id: station_id },
        data: { balance: { increment: amount } }
      });

      // Create transaction
      return tx.fuel_transactions.create({
        data: {
          company_id,
          fuel_station_id: station_id,
          vehicle_id,
          driver_id,
          amount,
          system_commission,
          total_deducted,
          status: "COMPLETED"
        }
      });
    });
  }

  async listTransactions(company_id) {
    const where = company_id ? { company_id } : {};
    return prisma.fuel_transactions.findMany({
      where,
      include: {
        fuel_station: { select: { name: true } },
        company: { select: { name: true } },
        vehicle: { select: { plate_no: true } }
      },
      orderBy: { created_at: "desc" }
    });
  }
}

module.exports = new FuelService();
