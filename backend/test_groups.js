const API_URL = "http://localhost:3000";

async function runTests() {
  console.log("--- STARTING GROUPS & SPLIT SHARING ENDPOINT TESTS ---");

  const emailA = `usera_${Date.now()}@example.com`;
  const emailB = `userb_${Date.now()}@example.com`;
  const password = "password123";

  // 1. Create User A
  console.log("\n1. Creating User A:", emailA);
  const signupResA = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailA, password, name: "Alice" }),
  });
  const dataA = await signupResA.json();
  if (signupResA.status !== 201) throw new Error("Failed to create User A: " + JSON.stringify(dataA));
  const tokenA = dataA.token;
  const userAId = dataA.user.id;
  console.log("User A created. ID:", userAId);

  // 2. Create User B
  console.log("\n2. Creating User B:", emailB);
  const signupResB = await fetch(`${API_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailB, password, name: "Bob" }),
  });
  const dataB = await signupResB.json();
  if (signupResB.status !== 201) throw new Error("Failed to create User B: " + JSON.stringify(dataB));
  const tokenB = dataB.token;
  const userBId = dataB.user.id;
  console.log("User B created. ID:", userBId);

  // 3. User A creates a Group
  console.log("\n3. User A creating group 'Goa Trip'...");
  const createGroupRes = await fetch(`${API_URL}/api/groups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      name: "Goa Trip",
      description: "Weekend fun at the beach",
    }),
  });
  const groupData = await createGroupRes.json();
  if (createGroupRes.status !== 201) throw new Error("Failed to create group: " + JSON.stringify(groupData));
  const groupId = groupData.group.id;
  console.log("Group created successfully! ID:", groupId);

  // 4. User A invites User B to the Group
  console.log("\n4. User A inviting User B to 'Goa Trip'...");
  const inviteRes = await fetch(`${API_URL}/api/groups/${groupId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      identifier: emailB,
    }),
  });
  const inviteData = await inviteRes.json();
  if (inviteRes.status !== 201) throw new Error("Failed to invite User B: " + JSON.stringify(inviteData));
  console.log("Bob successfully invited to group!");

  // 5. User B fetches their groups (should see 'Goa Trip' with 0 balance)
  console.log("\n5. User B fetching groups...");
  const getGroupsRes = await fetch(`${API_URL}/api/groups`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${tokenB}`,
    },
  });
  const listData = await getGroupsRes.json();
  if (getGroupsRes.status !== 200) throw new Error("Failed to fetch groups list: " + JSON.stringify(listData));
  const myGroup = listData.groups.find(g => g.id === groupId);
  if (!myGroup) throw new Error("Bob's groups does not contain the newly joined Goa Trip group!");
  console.log(`Found group: "${myGroup.name}", Net Balance: ₹${myGroup.netBalance}, Members: ${myGroup.memberCount}`);
  if (myGroup.netBalance !== 0) throw new Error(`Initial balance should be 0, got ${myGroup.netBalance}`);

  // 6. User A logs an expense: ₹1,500 split equally
  console.log("\n6. User A logging expense: ₹1,500 dinner split equally...");
  const createExpenseRes = await fetch(`${API_URL}/api/groups/${groupId}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      description: "Dinner at beach cafe",
      amount: 1500,
      paidById: userAId,
      splits: [
        { userId: userAId, amount: 750 },
        { userId: userBId, amount: 750 }
      ]
    }),
  });
  const expenseData = await createExpenseRes.json();
  if (createExpenseRes.status !== 201) throw new Error("Failed to log expense: " + JSON.stringify(expenseData));
  console.log("Expense logged successfully!");

  // 7. Fetch group details to verify balances and simplified debt
  console.log("\n7. Fetching group details...");
  const getDetailsRes = await fetch(`${API_URL}/api/groups/${groupId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${tokenA}`,
    },
  });
  const detailsData = await getDetailsRes.json();
  if (getDetailsRes.status !== 200) throw new Error("Failed to fetch group details: " + JSON.stringify(detailsData));
  
  const aliceDetails = detailsData.members.find(m => m.id === userAId);
  const bobDetails = detailsData.members.find(m => m.id === userBId);
  console.log(`Alice Balance: ₹${aliceDetails.netBalance}`);
  console.log(`Bob Balance: ₹${bobDetails.netBalance}`);
  console.log("Simplified Debts:", JSON.stringify(detailsData.simplifiedDebts));

  if (aliceDetails.netBalance !== 750) throw new Error("Alice balance should be +750, got " + aliceDetails.netBalance);
  if (bobDetails.netBalance !== -750) throw new Error("Bob balance should be -750, got " + bobDetails.netBalance);
  if (detailsData.simplifiedDebts.length !== 1) throw new Error("There should be exactly 1 debt path");
  
  const debt = detailsData.simplifiedDebts[0];
  if (debt.from !== userBId || debt.to !== userAId || debt.amount !== 750) {
    throw new Error("Invalid simplified debt calculations: " + JSON.stringify(debt));
  }
  console.log(`✅ Debt verified: ${debt.fromName} owes ${debt.toName} ₹${debt.amount}`);

  // 8. User B settles debt by logging a ₹750 payment
  console.log("\n8. User B logging settlement of ₹750 to Alice...");
  const settleRes = await fetch(`${API_URL}/api/groups/${groupId}/expenses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${tokenB}`,
    },
    body: JSON.stringify({
      description: "Settlement: Bob to Alice",
      amount: 750,
      paidById: userBId,
      splits: [
        { userId: userAId, amount: 750 } // Bob pays, Alice receives
      ]
    }),
  });
  const settleData = await settleRes.json();
  if (settleRes.status !== 201) throw new Error("Failed to log settlement: " + JSON.stringify(settleData));
  console.log("Settlement logged!");

  // 9. Fetch group details again to confirm balances are now zero
  console.log("\n9. Fetching final group details...");
  const finalDetailsRes = await fetch(`${API_URL}/api/groups/${groupId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${tokenA}`,
    },
  });
  const finalData = await finalDetailsRes.json();
  const finalAlice = finalData.members.find(m => m.id === userAId);
  const finalBob = finalData.members.find(m => m.id === userBId);
  console.log(`Final Alice Balance: ₹${finalAlice.netBalance}`);
  console.log(`Final Bob Balance: ₹${finalBob.netBalance}`);
  console.log("Final Simplified Debts:", JSON.stringify(finalData.simplifiedDebts));

  if (Math.abs(finalAlice.netBalance) > 0.01 || Math.abs(finalBob.netBalance) > 0.01) {
    throw new Error("Balances are not balanced to zero!");
  }
  if (finalData.simplifiedDebts.length !== 0) {
    throw new Error("Simplified debts should be empty!");
  }
  
  console.log("\n🎉 ALL GROUP SPLIT TESTS PASSED SUCCESSFULLY! ✅");
}

runTests().catch(err => {
  console.error("\n❌ TEST FAILURE:", err.message);
  process.exit(1);
});
