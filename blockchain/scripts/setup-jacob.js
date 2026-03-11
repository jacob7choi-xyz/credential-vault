const hre = require("hardhat");

async function main() {
  console.log("\nSetting up Jacob's Credential Vault...\n");

  // Get signers
  const [deployer, jacob, colbyCollege] = await hre.ethers.getSigners();

  console.log("Deployer (Admin):", deployer.address);
  console.log("Jacob:", jacob.address);
  console.log("Colby College:", colbyCollege.address);

  // Load deployed contracts
  const deployment = require("../deployments/localhost.json");

  const didRegistry = await hre.ethers.getContractAt("DIDRegistry", deployment.contracts.DIDRegistry.address);
  const credentialIssuer = await hre.ethers.getContractAt("CredentialIssuer", deployment.contracts.CredentialIssuer.address);
  const credentialVerifier = await hre.ethers.getContractAt("CredentialVerifier", deployment.contracts.CredentialVerifier.address);

  console.log("\nStep 1: Creating Jacob's DID...");
  const jacobDID = `did:eth:${jacob.address.slice(0, 10)}`;
  const tx1 = await didRegistry.connect(jacob).createDID(
    jacobDID,
    `pk-${jacob.address.slice(0, 10)}`,
    "https://jacob-portfolio.com"
  );
  await tx1.wait();
  console.log("DID Created:", jacobDID);

  console.log("\nStep 2: Registering Colby College as Issuer...");
  const tx2 = await credentialIssuer.connect(deployer).registerIssuer(
    colbyCollege.address,
    "Colby College"
  );
  await tx2.wait();
  console.log("Colby College registered as authorized issuer");

  console.log("\nStep 3: Issuing Jacob's Student Enrollment Credential...");
  const credentialId = "colby-student-jacob-2024";
  const credentialData = JSON.stringify({
    studentId: "jacob.choi",
    major: "Computer Science: Artificial Intelligence",
    gpa: "3.86",
    expectedGraduation: "May 2027",
    status: "Enrolled",
    enrollmentDate: "August 2022"
  });

  const tx3 = await credentialIssuer.connect(colbyCollege).issueCredential(
    credentialId,
    jacobDID,
    "Student Enrollment - Computer Science: AI",
    credentialData,
    0 // Never expires
  );
  await tx3.wait();
  console.log("Student credential issued!");

  console.log("\nStep 4: Verifying the credential...");
  const [isValid, issuer, credType, holder] = await credentialVerifier.quickVerify(credentialId);

  console.log("\nVerification Results:");
  console.log("=".repeat(60));
  console.log("Valid:", isValid);
  console.log("Issued By:", issuer);
  console.log("Credential Type:", credType);
  console.log("Holder DID:", holder);
  console.log("=".repeat(60));

  console.log("\nSummary:");
  console.log(`
  Your Credential Vault is ready!

  Your Details:
     - Wallet: ${jacob.address}
     - DID: ${jacobDID}
     - Institution: Colby College
     - Major: Computer Science: AI
     - GPA: 3.86
     - Expected Graduation: 2027

  Next Steps:
     1. Import this wallet to MetaMask: ${jacob.address}
     2. Private Key: ${await jacob.provider.send("eth_accounts")}
     3. Open http://localhost:3001
     4. Connect wallet and see your credential!
  `);

  console.log("\nWhen you graduate in 2027, you can issue your degree credential!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
