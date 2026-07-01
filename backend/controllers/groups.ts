import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";
import { normalizePhoneNumber } from "./auth.js";
import twilio from "twilio";

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

let twilioClient: any = null;
if (twilioAccountSid && twilioAuthToken) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
}

// POST /api/groups
export const createGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description, memberIdentifiers, icon } = req.body;
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
          icon: icon ? icon.trim() : "👥",
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
      let lastActivity: string | null = null;

      group.expenses.forEach((expense) => {
        if (expense.paidById === userId) {
          totalPaid += expense.amount;
        }

        const mySplit = expense.splits.find((s) => s.userId === userId);
        if (mySplit) {
          totalOwed += mySplit.amount;
        }

        const expDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
        if (!lastActivity || expDate > new Date(lastActivity)) {
          lastActivity = expDate.toISOString();
        }
      });

      const netBalance = totalPaid - totalOwed;

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        icon: group.icon || "👥",
        role: membership.role,
        joinedAt: membership.joinedAt,
        memberCount: group.members.length,
        members: group.members.map((m) => ({
          id: m.user.id,
          name: m.user.name || "Unknown Member",
        })),
        netBalance,
        lastActivity,
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

    const inviteLink = `${process.env.FRONTEND_URL || "http://192.168.1.4:8081"}/group-details?id=${groupId}`;

    if (!targetUser) {
      const isEmail = cleaned.includes("@");
      const phone = isEmail ? null : normalizePhoneNumber(cleaned);
      const email = isEmail ? cleaned.toLowerCase() : null;
      const name = isEmail ? cleaned.split("@")[0] : cleaned;

      targetUser = await prisma.user.create({
        data: {
          name,
          email,
          phoneNumber: phone,
          passwordHash: "", // Blank password for pending signups
        },
      });
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

    // Optional: Re-split past expenses equally
    if (req.body.reSplitPastExpenses === true) {
      const allMembers = await prisma.groupMember.findMany({
        where: { groupId }
      });
      const memberCount = allMembers.length;

      if (memberCount > 1) {
        const expenses = await prisma.expense.findMany({
          where: { groupId }
        });

        for (const exp of expenses) {
          const splitAmount = parseFloat((exp.amount / memberCount).toFixed(2));
          // Delete old splits
          await prisma.expenseSplit.deleteMany({
            where: { expenseId: exp.id }
          });
          // Add new splits for all members
          await prisma.expenseSplit.createMany({
            data: allMembers.map(m => ({
              expenseId: exp.id,
              userId: m.userId,
              amount: splitAmount
            }))
          });
        }
      }
    }

    // Send Twilio Invitation SMS
    if (twilioClient && targetUser.phoneNumber) {
      try {
        const groupInfo = await prisma.group.findUnique({ where: { id: groupId } });
        const groupName = groupInfo?.name || "Group";
        const inviterName = req.user?.name || "A friend";

        await twilioClient.messages.create({
          body: `Hi! ${inviterName} added you to the group "${groupName}" on Splikaro. Open the app to join: ${inviteLink}`,
          from: twilioPhoneNumber,
          to: targetUser.phoneNumber,
        });
        console.log("SMS Invite sent successfully to", targetUser.phoneNumber);
      } catch (smsErr) {
        console.error("Twilio send invitation SMS failed:", smsErr);
      }
    }

    res.status(201).json({
      message: "Member added successfully",
      member: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        phoneNumber: targetUser.phoneNumber,
        role: membership.role,
      },
      inviteLink,
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
                upiId: true,
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
      if (expense.status === "PENDING_VERIFICATION") return;
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
      upiId: m.user.upiId,
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

    const simplifiedDebts: {
      from: string;
      fromName: string;
      fromPhone: string | null;
      to: string;
      toName: string;
      toPhone: string | null;
      toUpiId: string | null;
      amount: number;
    }[] = [];

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const transferAmount = Math.min(debtor.amount, creditor.amount);
      const debtorMember = group.members.find((m: any) => m.userId === debtor.userId);
      const creditorMember = group.members.find((m: any) => m.userId === creditor.userId);

      simplifiedDebts.push({
        from: debtor.userId,
        fromName: debtor.name,
        fromPhone: debtorMember?.user?.phoneNumber || null,
        to: creditor.userId,
        toName: creditor.name,
        toPhone: creditorMember?.user?.phoneNumber || null,
        toUpiId: creditorMember?.user?.upiId || null,
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
        icon: group.icon || "👥",
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
      },
      members: membersWithBalances,
      expenses: group.expenses.map((e: any) => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        date: e.date,
        category: e.category,
        paidById: e.paidById,
        paidBy: e.paidBy,
        splits: e.splits.map((s: any) => ({
          id: s.id,
          userId: s.userId,
          amount: s.amount,
          user: s.user
        })),
        createdAt: e.createdAt,
      })),
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
    const { description, amount, date, paidById, splits, category, status } = req.body;
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
          category: category ? category.trim() : null,
          status: status && typeof status === "string" ? status.trim() : "APPROVED",
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

// PATCH /api/groups/:id
export const updateGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const { name, description, icon } = req.body;
    const userId = req.userId!;

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership || membership.role !== "ADMIN") {
      res.status(403).json({ error: "Only group admins can update group details" });
      return;
    }

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: {
        name: name !== undefined ? name.trim() : undefined,
        description: description !== undefined ? description.trim() : undefined,
        icon: icon !== undefined ? icon.trim() : undefined,
      }
    });

    res.json({ message: "Group updated successfully", group: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update group" });
  }
};

// DELETE /api/groups/:id
export const deleteGroup = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const userId = req.userId!;

    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!membership || membership.role !== "ADMIN") {
      res.status(403).json({ error: "Only group admins can delete this group" });
      return;
    }

    await prisma.group.delete({
      where: { id: groupId }
    });

    res.json({ message: "Group deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete group" });
  }
};

// DELETE /api/groups/:id/members/:memberId
export const removeGroupMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const memberId = req.params.memberId as string;
    const userId = req.userId!;

    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId }
      }
    });

    if (!requesterMembership) {
      res.status(403).json({ error: "Access denied. You are not a member of this group." });
      return;
    }

    const isSelf = memberId === userId;
    const isAdmin = requesterMembership.role === "ADMIN";

    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: "Only group admins can remove other members" });
      return;
    }

    await prisma.groupMember.delete({
      where: {
        groupId_userId: {
          groupId,
          userId: memberId
        }
      }
    });

    res.json({ message: "Member removed successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to remove member" });
  }
};

// PATCH /api/groups/:id/expenses/:expenseId/verify
export const verifyExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const expenseId = req.params.expenseId as string;
    const userId = req.userId!;

    // 1. Fetch expense with splits
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { splits: true }
    });

    if (!expense || expense.groupId !== groupId) {
      res.status(404).json({ error: "Expense not found in this group" });
      return;
    }

    if (expense.status !== "PENDING_VERIFICATION") {
      res.status(400).json({ error: "This expense is not pending verification" });
      return;
    }

    // 2. Security check: Only the payee/recipient (the user receiving the money in the split)
    // can verify a settlement.
    const isRecipient = expense.splits.some((s) => s.userId === userId);
    if (!isRecipient) {
      res.status(403).json({ error: "Access denied. Only the recipient can verify this settlement." });
      return;
    }

    // 3. Update status to APPROVED
    const updatedExpense = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: "APPROVED" }
    });

    res.json({
      message: "Settlement verified and approved successfully",
      expense: updatedExpense
    });
  } catch (error: any) {
    console.error("Verify expense error:", error);
    res.status(500).json({ error: error.message || "Failed to verify expense" });
  }
};
