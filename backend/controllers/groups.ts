import { Request, Response } from "express";
import { prisma } from "../config/dbConnect.js";
import { AuthRequest } from "../middleware/auth.js";
import { normalizePhoneNumber } from "./auth.js";
import { awardCoins } from "./coins.js";
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

    // 2. Add other members. Besides email/phone contacts, this also accepts a
    // spoken name from Kryze Voice and creates a local placeholder member that
    // can be connected to a real contact later.
    const addedMembers: any[] = [];
    if (Array.isArray(memberIdentifiers) && memberIdentifiers.length > 0) {
      for (const idf of memberIdentifiers) {
        if (!idf || !idf.trim()) continue;
        const cleaned = idf.trim();
        
        const isEmail = cleaned.includes("@");
        const looksLikePhoneNumber = /^\+?\d{10,15}$/.test(cleaned.replace(/[\s\-()]/g, ""));
        const normalizedPhone = looksLikePhoneNumber ? normalizePhoneNumber(cleaned) : null;
        let targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              { email: cleaned.toLowerCase() },
              ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }] : []),
              { phoneNumber: cleaned }
            ],
          },
        });

        if (!targetUser && !isEmail && !looksLikePhoneNumber) {
          targetUser = await prisma.user.create({
            data: { name: cleaned, passwordHash: "" },
          });
        }

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

    const inviteLink = `${process.env.FRONTEND_URL || "http://192.168.1.3:8081"}/group-details?id=${groupId}`;

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
          body: `Hi! ${inviterName} added you to the group "${groupName}" on SplitX. Open the app to join: ${inviteLink}`,
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
        status: e.status,
        receiptUrl: e.receiptUrl,
        items: e.items,
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
    const { description, amount, date, paidById, splits, category, status, receiptUrl, items } = req.body;
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
          receiptUrl: receiptUrl && typeof receiptUrl === "string" ? receiptUrl.trim() : null,
          items: items ? (typeof items === "string" ? items : JSON.stringify(items)) : null,
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

// PATCH /api/groups/:id/members/:memberId/upi
export const updateMemberUpi = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const memberId = req.params.memberId as string;
    const { upiId } = req.body;
    const userId = req.userId!;

    // 1. Verify requester is a member of the group
    const isRequesterMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } }
    });
    if (!isRequesterMember) {
      res.status(403).json({ error: "Access denied. You are not a member of this group." });
      return;
    }

    // 2. Verify target member is in the group
    const isTargetMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: memberId } }
    });
    if (!isTargetMember) {
      res.status(404).json({ error: "Member not found in this group" });
      return;
    }

    if (!upiId || !upiId.trim()) {
      res.status(400).json({ error: "Valid UPI ID is required" });
      return;
    }

    // 3. Update the target user's upiId
    await prisma.user.update({
      where: { id: memberId },
      data: { upiId: upiId.trim() }
    });

    res.json({ message: "UPI ID updated successfully" });
  } catch (error: any) {
    console.error("Update member UPI error:", error);
    res.status(500).json({ error: error.message || "Failed to update UPI ID" });
  }
};

// PATCH /api/groups/:id/expenses/:expenseId
export const updateExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const expenseId = req.params.expenseId as string;
    const userId = req.userId!;
    const { description, amount, date, category, splits, receiptUrl, items } = req.body;

    // 1. Load the expense and verify it belongs to this group
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, groupId },
      include: { splits: true },
    });

    if (!expense) {
      res.status(404).json({ error: "Expense not found in this group" });
      return;
    }

    // 2. Only the original payer or a group ADMIN can edit
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    const isCreator = expense.paidById === userId;
    const isAdmin = membership?.role === "ADMIN";

    if (!isCreator && !isAdmin) {
      res.status(403).json({ error: "Only the expense creator or group admin can edit this expense" });
      return;
    }

    // 3. Validate inputs
    const parsedAmount = amount !== undefined ? parseFloat(amount) : expense.amount;
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: "Valid expense amount is required" });
      return;
    }

    // 4. If new splits are provided, validate they sum correctly
    if (Array.isArray(splits) && splits.length > 0) {
      const splitsTotal = splits.reduce((sum: number, s: any) => sum + parseFloat(s.amount || 0), 0);
      const diff = Math.abs(splitsTotal - parsedAmount);
      if (diff > 0.05) {
        res.status(400).json({
          error: `Sum of split shares (₹${splitsTotal}) does not match total amount (₹${parsedAmount})`,
        });
        return;
      }
    }

    // 5. Update expense and recreate splits atomically
    const updated = await prisma.$transaction(async (tx) => {
      const e = await tx.expense.update({
        where: { id: expenseId },
        data: {
          description: description ? description.trim() : expense.description,
          amount: parsedAmount,
          date: date ? new Date(date) : expense.date,
          category: category !== undefined ? (category ? category.trim() : null) : expense.category,
          receiptUrl: receiptUrl !== undefined ? (receiptUrl ? receiptUrl.trim() : null) : expense.receiptUrl,
          items: items !== undefined ? (items ? (typeof items === "string" ? items : JSON.stringify(items)) : null) : expense.items,
        },
      });

      // Recreate splits only if a new splits array is provided
      if (Array.isArray(splits) && splits.length > 0) {
        await tx.expenseSplit.deleteMany({ where: { expenseId } });
        for (const split of splits) {
          await tx.expenseSplit.create({
            data: {
              expenseId,
              userId: split.userId,
              amount: parseFloat(split.amount),
            },
          });
        }
      }

      return e;
    });

    res.json({ message: "Expense updated successfully", expense: updated });
  } catch (error: any) {
    console.error("Update expense error:", error);
    res.status(500).json({ error: error.message || "Failed to update expense" });
  }
};

// DELETE /api/groups/:id/expenses/:expenseId
export const deleteExpense = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const expenseId = req.params.expenseId as string;
    const userId = req.userId!;

    // 1. Load the expense and verify it belongs to this group
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, groupId },
    });

    if (!expense) {
      res.status(404).json({ error: "Expense not found in this group" });
      return;
    }

    // 2. Only the original payer or a group ADMIN can delete
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    const isCreator = expense.paidById === userId;
    const isAdmin = membership?.role === "ADMIN";

    if (!isCreator && !isAdmin) {
      res.status(403).json({ error: "Only the expense creator or group admin can delete this expense" });
      return;
    }

    // 3. Delete (splits cascade automatically via Prisma schema)
    await prisma.expense.delete({ where: { id: expenseId } });

    res.json({ message: "Expense deleted successfully" });
  } catch (error: any) {
    console.error("Delete expense error:", error);
    res.status(500).json({ error: error.message || "Failed to delete expense" });
  }
};

// POST /api/groups/:id/settlement/pay
export const createSettlementPaymentLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const groupId = req.params.id as string;
    const { amount, toUserId } = req.body;
    const userId = req.userId!;

    // 1. Verify requester is a member of the group
    const isRequesterMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } }
    });
    if (!isRequesterMember) {
      res.status(403).json({ error: "Access denied. You are not a member of this group." });
      return;
    }

    if (!amount || amount <= 0) {
      res.status(400).json({ error: "Valid payment amount is required" });
      return;
    }

    // Resolve users
    const fromUser = await prisma.user.findUnique({ where: { id: userId } });
    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });

    if (!fromUser || !toUser) {
      res.status(404).json({ error: "Sender or receiver user record not found" });
      return;
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const paymentProviderMode = process.env.PAYMENT_PROVIDER_MODE?.toLowerCase() ?? "razorpay";
    const description = `Settlement: ${fromUser.name || "User"} to ${toUser.name || "User"}`;
    // Browser callbacks and mock checkout links must be reachable from the
    // device, so prefer an explicitly configured public URL over a local IP.
    const apiHost = process.env.PUBLIC_API_URL || process.env.BACKEND_URL || process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.3:3000";

    if (paymentProviderMode === "razorpay" && keyId && keySecret) {
      // Direct integration with real Razorpay Checkout API
      const authStr = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      
      const rzpResponse = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${authStr}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // in paise (e.g. ₹925.98 -> 92598)
          currency: "INR",
          accept_partial: false,
          description: description,
          callback_url: `${apiHost}/api/groups/settlement/callback?groupId=${groupId}&amount=${amount}&fromUserId=${userId}&toUserId=${toUserId}`,
          callback_method: "get"
        })
      });

      const data = await rzpResponse.json();
      if (data.short_url) {
        res.json({ paymentUrl: data.short_url });
      } else {
        console.error("Razorpay Payment Link creation failed:", data);
        res.status(400).json({ error: data.error?.description || "Failed to create Razorpay checkout link" });
      }
    } else {
      // Sandbox Mock mode
      const mockUrl = `${apiHost}/api/groups/settlement/mock-checkout?groupId=${groupId}&amount=${amount}&fromUserId=${userId}&toUserId=${toUserId}`;
      res.json({ paymentUrl: mockUrl });
    }
  } catch (error: any) {
    console.error("Create payment link error:", error);
    res.status(500).json({ error: error.message || "Failed to create payment link" });
  }
};

// GET /api/groups/settlement/mock-checkout
export const handleMockCheckoutPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId, amount, fromUserId, toUserId } = req.query;

    const fromUser = await prisma.user.findUnique({ where: { id: fromUserId as string } });
    const toUser = await prisma.user.findUnique({ where: { id: toUserId as string } });

    const payerName = fromUser?.name || "Payer";
    const payeeName = toUser?.name || "Payee";
    const amountVal = parseFloat(amount as string).toFixed(2);
    const callbackUrl = `/api/groups/settlement/callback?groupId=${groupId}&amount=${amount}&fromUserId=${fromUserId}&toUserId=${toUserId}&razorpay_payment_id=pay_mock_${Date.now()}`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Razorpay Test Sandbox</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #f4f6f9;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              color: #2c3e50;
            }
            .checkout-container {
              background: #ffffff;
              width: 100%;
              max-width: 400px;
              border-radius: 12px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
              overflow: hidden;
              border: 1px solid #e1e8ed;
            }
            .header {
              background-color: #0b1a30;
              color: #ffffff;
              padding: 24px;
              text-align: center;
            }
            .header h2 {
              margin: 0;
              font-size: 18px;
              font-weight: 600;
              letter-spacing: 0.5px;
            }
            .header p {
              margin: 4px 0 0;
              font-size: 11px;
              color: #00b0ff;
              text-transform: uppercase;
              font-weight: bold;
            }
            .content {
              padding: 24px;
            }
            .amount-section {
              text-align: center;
              margin-bottom: 24px;
            }
            .amount-label {
              font-size: 12px;
              color: #7f8c8d;
              text-transform: uppercase;
            }
            .amount-value {
              font-size: 32px;
              font-weight: 700;
              color: #2c3e50;
              margin: 4px 0;
            }
            .details-list {
              border-top: 1px solid #f1f2f6;
              border-bottom: 1px solid #f1f2f6;
              padding: 16px 0;
              margin-bottom: 24px;
            }
            .detail-row {
              display: flex;
              justify-content: space-between;
              font-size: 13px;
              margin-bottom: 8px;
            }
            .detail-row:last-child {
              margin-bottom: 0;
            }
            .detail-label {
              color: #95a5a6;
            }
            .detail-val {
              font-weight: 600;
            }
            .btn {
              display: block;
              width: 100%;
              padding: 14px;
              border-radius: 6px;
              font-weight: bold;
              font-size: 15px;
              text-align: center;
              cursor: pointer;
              box-sizing: border-box;
              text-decoration: none;
              margin-bottom: 12px;
              transition: background 0.2s;
            }
            .btn-pay {
              background-color: #3399cc;
              color: #ffffff;
              border: none;
            }
            .btn-pay:hover {
              background-color: #267fa6;
            }
            .btn-cancel {
              background-color: #ffffff;
              color: #e74c3c;
              border: 1px solid #e74c3c;
            }
            .btn-cancel:hover {
              background-color: #fdf2f2;
            }
          </style>
        </head>
        <body>
          <div class="checkout-container">
            <div class="header">
              <h2>Razorpay Checkout</h2>
              <p>Test Sandbox Mode</p>
            </div>
            <div class="content">
              <div class="amount-section">
                <div class="amount-label">Payment Amount</div>
                <div class="amount-value">₹${amountVal}</div>
              </div>
              <div class="details-list">
                <div class="detail-row">
                  <div class="detail-label">Payer</div>
                  <div class="detail-val">${payerName}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Payee</div>
                  <div class="detail-val">${payeeName}</div>
                </div>
                <div class="detail-row">
                  <div class="detail-label">Description</div>
                  <div class="detail-val">SplitX Settle Split</div>
                </div>
              </div>
              
              <a href="${callbackUrl}" class="btn btn-pay">Simulate Payment Success</a>
              <a href="javascript:window.close();" class="btn btn-cancel" onclick="alert('Payment Cancelled'); window.location.href='frontendapp://group-details?id=${groupId}'">Cancel Payment</a>
            </div>
          </div>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error: any) {
    console.error("Render mock checkout error:", error);
    res.status(500).send("Failed to render sandbox checkout");
  }
};

// GET /api/groups/settlement/callback
export const handleSettlementCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId, amount, fromUserId, toUserId } = req.query as Record<string, string>;

    const fromUser = await prisma.user.findUnique({ where: { id: fromUserId } });
    const toUser = await prisma.user.findUnique({ where: { id: toUserId } });

    if (!fromUser || !toUser) {
      res.status(404).json({ error: "User records not found" });
      return;
    }

    const description = `Settlement: ${fromUser.name || "User"} to ${toUser.name || "User"}`;
    const amountVal = parseFloat(amount);

    // Coins are deterministic: 1 coin per ₹100 settled (minimum 1 coin per settlement)
    const projectedCoins = Math.max(1, Math.floor(amountVal / 100));

    // Idempotency guard: if a settlement for this payer/amount was already recorded
    // recently (e.g. the in-browser callback and the app both calling), don't create a
    // duplicate expense nor award duplicate coins — just report the earned total.
    const recentSettlement = await prisma.expense.findFirst({
      where: {
        groupId,
        paidById: fromUserId,
        amount: amountVal,
        description: { startsWith: "Settlement:" },
        createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
      },
    });

    let coinsEarned = projectedCoins;
    if (!recentSettlement) {
      // Save settled transaction in DB
      const newSettlement = await prisma.expense.create({
        data: {
          groupId,
          description,
          amount: amountVal,
          paidById: fromUserId,
          status: "APPROVED",
          splits: {
            create: [
              {
                userId: toUserId,
                amount: amountVal
              }
            ]
          }
        }
      });

      // Award coins to payer for completing settlement
      const awarded = await awardCoins(fromUserId, amountVal, newSettlement.id);
      if (awarded > 0) {
        coinsEarned = awarded;
      }
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              background-color: #faf7f2;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              color: #231f18;
              padding: 20px;
              text-align: center;
            }
            .card {
              background: #ffffff;
              border-radius: 16px;
              padding: 32px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
              max-width: 360px;
              width: 100%;
              border: 1px solid rgba(0, 0, 0, 0.04);
              box-sizing: border-box;
            }
            .icon {
              width: 64px;
              height: 64px;
              border-radius: 32px;
              background: #edf3ed;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 20px;
              color: #2e7d32;
              font-size: 32px;
              font-weight: bold;
            }
            h1 {
              font-size: 20px;
              margin-bottom: 8px;
              font-weight: 700;
            }
            p {
              font-size: 14px;
              color: #7f8c8d;
              line-height: 1.5;
              margin-bottom: 12px;
            }
            .amount {
              font-size: 28px;
              font-weight: bold;
              color: #2e7d32;
              margin-bottom: 16px;
            }
            .coin-row {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: #fef3c7;
              border: 1px solid #fde68a;
              color: #92400e;
              font-weight: bold;
              font-size: 14px;
              padding: 8px 16px;
              border-radius: 999px;
              margin-bottom: 16px;
            }
            .btn {
              background-color: #e6a23c;
              color: #ffffff;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-weight: bold;
              font-size: 14px;
              text-decoration: none;
              cursor: pointer;
              display: inline-block;
              transition: background 0.2s;
              margin-top: 8px;
            }
            .btn:hover {
              background-color: #d18d2c;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h1>Payment Successful</h1>
            <p>Your settlement payment of</p>
            <div class="amount">₹${amountVal.toFixed(2)}</div>
            <div class="coin-chip">+${coinsEarned} Splitx Coin${coinsEarned === 1 ? "" : "s"} earned</div>
            <p>has been logged in the group ledger. Tap Return to SplitX to see your splash.</p>
            <a href="frontendapp://group-details?id=${groupId}" class="btn">Return to SplitX</a>
          </div>
        </body>
      </html>
    `;
    res.send(html);
  } catch (error: any) {
    console.error("Handle settlement callback error:", error);
    res.status(500).send("Failed to log payment transaction");
  }
};
