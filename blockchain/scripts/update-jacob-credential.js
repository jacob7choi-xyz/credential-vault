const hre = require("hardhat");

async function main() {
  console.log("\n🔄 Updating Jacob's Credential with correct date...\n");

  // Get signers
  const [deployer, jacob, colbyCollege] = await hre.ethers.getSigners();

  // Load deployed contracts
  const deployment = require("../deployments/localhost.json");
  const credentialIssuer = await hre.ethers.getContractAt("CredentialIssuer", deployment.contracts.CredentialIssuer.address);

  console.log("🗑️  Step 1: Revoking old credential...");
  const oldCredentialId = "colby-student-jacob-2024";
  const tx1 = await credentialIssuer.connect(colbyCollege).revokeCredential(oldCredentialId);
  await tx1.wait();
  console.log("✅ Old credential revoked");

  console.log("\n📜 Step 2: Issuing corrected credential...");
  const jacobDID = `did:eth:${jacob.address.slice(0, 10)}`;
  const newCredentialId = "colby-student-jacob-2024-v2";
  const credentialData = JSON.stringify({
    studentId: "jacob.choi",
    major: "Computer Science: Artificial Intelligence",
    gpa: "3.86",
    expectedGraduation: "May 2027",
    status: "Enrolled",
    enrollmentDate: "August 2022"  // Corrected!
  });

  const tx2 = await credentialIssuer.connect(colbyCollege).issueCredential(
    newCredentialId,
    jacobDID,
    "Student Enrollment - Computer Science: AI",
    credentialData,
    0 // Never expires
  );
  await tx2.wait();
  console.log("✅ New credential issued with correct enrollment date!");

  console.log("\n✨ Updated Credential:");
  console.log("=".repeat(60));
  console.log("Credential ID:", newCredentialId);
  console.log("Enrollment Date: August 2022 ✓");
  console.log("=".repeat(60));
  console.log("\n🎉 Your credential is now correct on-chain!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
