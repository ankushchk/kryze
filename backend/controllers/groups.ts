import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";
import { normalizePhoneNumber } from "./auth.js";

// POST /api/groups
export const createGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, memberIdentifiers } = req.body;
    const userId = req.userId!;

    if (!name || !name.trim()) {
      res.status(400).json({ error: "Group name is required" });
      return;
    }

    // 1. Create group and add creator as ADMIN in a transaction
    const group = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          name: name.trim(),
          description: description ? description.trim() : null,
        },
      });

      await tx.groupMember.create({
        data: {
          groupId: g.id,
          userId,
          role: "ADMIN",
        },
      });

      return g;
    });

    // 2. Add other members if identifiers (emails or phone numbers) are supplied
    const addedMembers: any[] = [];
    if (Array.isArray(memberIdentifiers) && memberIdentifiers.length > 0) {
      for (const idf of memberIdentifiers) {
        if (!idf || !idf.trim()) continue;
        const cleaned = idf.trim();
        
        let targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: cleaned.toLowerCase() },
              { phoneNumber: normalizePhoneNumber(cleaned) },
              { phoneNumber: cleaned }
            ],
          },
        });

        if (targetUser && targetUser.id !== userId) {
          try {
            await prisma.groupMember.create({
              data: {
                groupId: group.id,
                userId: targetUser.id,
                role: "MEMBER",
              },
            });
            addedMembers.push({
              id: targetUser.id,
              name: targetUser.name,
              email: targetUser.email,
              phoneNumber: targetUser.phoneNumber,
            });
          } catch (err) {
            // Member might already be added
          }
        }
      }
    }

    res.status(201).json({
      group: {
        ...group,
        addedMembers,
      },
    });
  } catch (error: any) {
    console.error("Create group error:", error);
    res.status(500).json({ error: error.message || "Failed to create group" });
  }
};

// GET /api/groups
export const listGroups = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    // Find all groups the user is a member of
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            expenses: {
              include: {
                splits: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const groupsList = memberships.map((membership) => {
      const group = membership.group;

      // Calculate current user's net balance in this group
      let totalPaid = 0;
      let totalOwed = 0;

      group.expenses.forEach((expense) => {
        if (expense.paidById === userId) {
          totalPaid += expense.amount;
        }

        const mySplit = expense.splits.find((s) => s.userId === userId);
        if (mySplit) {
          totalOwed += mySplit.amount;
        }
      });

      const netBalance = totalPaid - totalOwed;

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        role: membership.role,
        joinedAt: membership.joinedAt,
        memberCount: group.members.length,
        members: group.members.map((m) => ({
          id: m.user.id,
          name: m.user.name || "Unknown Member",
        })),
        netBalance,
        createdAt: group.createdAt,
      };
    });

    res.json({ groups: groupsList });
  } catch (error: any) {
    console.error("List groups error:", error);
    res.status(500).json({ error: error.message || "Failed to list groups" });
  }
};

// POST /api/groups/:id/members
export const addGroupMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const identifier = req.body.identifier as string;
    const userId = req.userId!;

    if (!identifier || !identifier.trim()) {
      res.status(400).json({ error: "Email or Phone number is required" });
      return;
    }

    // Verify current user is in this group
    const isMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!isMember) {
      res.status(403).json({ error: "Access denied. You are not a member of this group." });
      return;
    }

    const cleaned = identifier.trim();
    let targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: cleaned.toLowerCase() },
          { phoneNumber: normalizePhoneNumber(cleaned) },
          { phoneNumber: cleaned }
        ],
      },
    });

    if (!targetUser) {
      res.status(404).json({ error: "User not found with this identifier" });
      return;
    }

    // Check if target is already in group
    const alreadyMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUser.id,
        },
      },
    });

    if (alreadyMember) {
      res.status(400).json({ error: "User is already a member of this group" });
      return;
    }

    const membership = await prisma.groupMember.create({
      data: {
        groupId,
        userId: targetUser.id,
        role: "MEMBER",
      },
    });

    res.status(201).json({
      message: "Member added successfully",
      member: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        phoneNumber: targetUser.phoneNumber,
        role: membership.role,
      },
    });
  } catch (error: any) {
    console.error("Add group member error:", error);
    res.status(500).json({ error: error.message || "Failed to add member" });
  }
};

// GET /api/groups/:id
export const getGroupDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const userId = req.userId!;

    // 1. Fetch group members and details
    const group = (await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
        expenses: {
          include: {
            paidBy: {
              select: {
                id: true,
                name: true,
              },
            },
            splits: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { date: "desc" },
        },
      },
    })) as any;

    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    // Verify requesting user is in this group
    const membershipCheck = group.members.some((m: any) => m.userId === userId);
    if (!membershipCheck) {
      res.status(403).json({ error: "Access denied. You are not in this group." });
      return;
    }

    // 2. Compute individual balances for each member in the group
    const balances: Record<string, number> = {};
    group.members.forEach((m: any) => {
      balances[m.userId] = 0;
    });

    group.expenses.forEach((expense: any) => {
      const paidById = expense.paidById;
      if (balances[paidById] !== undefined) {
        balances[paidById] += expense.amount;
      }

      expense.splits.forEach((split: any) => {
        const debtorId = split.userId;
        if (balances[debtorId] !== undefined) {
          balances[debtorId] -= split.amount;
        }
      });
    });

    const membersWithBalances = group.members.map((m: any) => ({
      id: m.user.id,
      name: m.user.name || "Unknown Member",
      email: m.user.email,
      phoneNumber: m.user.phoneNumber,
      role: m.role,
      joinedAt: m.joinedAt,
      netBalance: balances[m.userId] || 0,
    }));

    // 3. Debt Simplification Algorithm (Greedy matching of debtors & creditors)
    const debtors: { userId: string; name: string; amount: number }[] = [];
    const creditors: { userId: string; name: string; amount: number }[] = [];

    group.members.forEach((m: any) => {
      const bal = balances[m.userId] || 0;
      const mName = m.user.name || "Unknown Member";
      
      // Filter out values close to 0 to avoid floating point issues (e.g. 0.0001)
      if (bal < -0.01) {
        debtors.push({ userId: m.userId, name: mName, amount: -bal });
      } else if (bal > 0.01) {
        creditors.push({ userId: m.userId, name: mName, amount: bal });
      }
    });

    // Sort debtors and creditors descending (largest debt/credit first)
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const simplifiedDebts: { from: string; fromName: string; to: string; toName: string; amount: number }[] = [];

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const transferAmount = Math.min(debtor.amount, creditor.amount);

      simplifiedDebts.push({
        from: debtor.userId,
        fromName: debtor.name,
        to: creditor.userId,
        toName: creditor.name,
        amount: Math.round(transferAmount * 100) / 100, // round to 2 decimals
      });

      debtor.amount -= transferAmount;
      creditor.amount -= transferAmount;

      if (debtor.amount < 0.01) {
        dIdx++;
      }
      if (creditor.amount < 0.01) {
        cIdx++;
      }
    }

    res.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
      members: membersWithBalances,
      expenses: group.expenses,
      simplifiedDebts,
    });
  } catch (error: any) {
    console.error("Get group details error:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve group details" });
  }
};

// POST /api/groups/:id/expenses
export const createExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const { description, amount, date, paidById, splits } = req.body;
    const userId = req.userId!;

    if (!description || !description.trim()) {
      res.status(400).json({ error: "Expense description is required" });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: "Valid expense amount is required" });
      return;
    }

    if (!paidById) {
      res.status(400).json({ error: "Paying user (paidById) is required" });
      return;
    }

    if (!Array.isArray(splits) || splits.length === 0) {
      res.status(400).json({ error: "Splits detail array is required" });
      return;
    }

    // 1. Verify split summation match
    const splitsTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount || 0), 0);
    const diff = Math.abs(splitsTotal - parsedAmount);
    if (diff > 0.05) {
      res.status(400).json({
        error: `Sum of split shares (₹${splitsTotal}) does not match total expense amount (₹${parsedAmount})`
      });
      return;
    }

    // 2. Verify current user is member of group
    const isMember = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!isMember) {
      res.status(403).json({ error: "Access denied. You are not a member of this group." });
      return;
    }

    // 3. Create expense and splits in a transaction
    const expense = await prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          groupId,
          paidById,
          description: description.trim(),
          amount: parsedAmount,
          date: date ? new Date(date) : new Date(),
        },
      });

      for (const split of splits) {
        await tx.expenseSplit.create({
          data: {
            expenseId: e.id,
            userId: split.userId,
            amount: parseFloat(split.amount),
          },
        });
      }

      return e;
    });

    res.status(201).json({
      message: "Expense logged successfully",
      expense,
    });
  } catch (error: any) {
    console.error("Create expense error:", error);
    res.status(500).json({ error: error.message || "Failed to log expense" });
  }
};
