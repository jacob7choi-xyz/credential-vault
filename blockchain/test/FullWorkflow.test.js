const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Complete Credential Vault Workflow", function () {

  async function deployAllContractsFixture() {
    const [admin, jacob, colbyCollege, employer] = await ethers.getSigners();

    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();

    const CredentialIssuer = await ethers.getContractFactory("CredentialIssuer");
    const credentialIssuer = await CredentialIssuer.deploy(didRegistry.target);

    const CredentialVerifier = await ethers.getContractFactory("CredentialVerifier");
    const credentialVerifier = await CredentialVerifier.deploy(didRegistry.target, credentialIssuer.target);

    return { didRegistry, credentialIssuer, credentialVerifier, admin, jacob, colbyCollege, employer };
  }

  it("Complete Jacob's Credential Journey", async function () {
    const { didRegistry, credentialIssuer, credentialVerifier, admin, jacob, colbyCollege, employer } =
      await loadFixture(deployAllContractsFixture);

    // 1. Jacob creates his DID
    const jacobDID = "did:jacob:main";
    await didRegistry.connect(jacob).createDID(
      jacobDID,
      "https://jacob-portfolio.com"
    );

    // 2. Colby College gets registered as credential issuer
    await credentialIssuer.registerIssuer(colbyCollege.address, "Colby College");

    // 3. Colby issues Jacob a diploma
    const diplomaId = "colby-cs-diploma-jacob-2024";
    await credentialIssuer.connect(colbyCollege).issueCredential(
      diplomaId,
      jacobDID,
      "Bachelor of Arts - Computer Science",
      '{"major": "Computer Science", "gpa": "3.8", "graduationDate": "2024-05-15"}',
      0 // Never expires
    );

    // 4. Employer requests verification
    const requestId = "google-verification-001";
    await credentialVerifier.connect(employer).requestVerification(
      requestId,
      jacobDID,
      [diplomaId],
      24 // Valid for 24 hours
    );

    // 5. Jacob approves the verification
    await credentialVerifier.connect(jacob).approveVerification(requestId);

    // 6. Employer executes verification
    await credentialVerifier.connect(employer).executeVerification(requestId);

    // 7. Employer checks results
    const results = await credentialVerifier.connect(employer).getVerificationResults(requestId);

    expect(results.length).to.equal(1);
    expect(results[0].isValid).to.be.true;
    expect(results[0].isAuthentic).to.be.true;
    expect(results[0].issuerName).to.equal("Colby College");

    // 8. Quick QR code verification
    const [isValid, issuer, credType, holder] = await credentialVerifier.quickVerify(diplomaId);
    expect(isValid).to.be.true;
    expect(issuer).to.equal("Colby College");
    expect(holder).to.equal(jacobDID);

    console.log("Jacob's Colby College diploma verified successfully!");
    console.log("Employer can instantly trust the credential!");
    console.log("No phone calls, no waiting - instant verification!");
  });

  it("Multiple credentials workflow", async function () {
    const { didRegistry, credentialIssuer, credentialVerifier, admin, jacob, colbyCollege, employer } =
      await loadFixture(deployAllContractsFixture);

    const jacobDID = "did:jacob:portfolio";

    // Jacob creates DID
    await didRegistry.connect(jacob).createDID(jacobDID, "https://jacob.com");

    // Register multiple institutions
    await credentialIssuer.registerIssuer(colbyCollege.address, "Colby College");

    // Issue multiple credentials
    await credentialIssuer.connect(colbyCollege).issueCredential(
      "colby-diploma-jacob",
      jacobDID,
      "Bachelor's Degree",
      '{"degree": "Computer Science"}',
      0
    );

    await credentialIssuer.connect(colbyCollege).issueCredential(
      "colby-honors-jacob",
      jacobDID,
      "Academic Honors",
      '{"honor": "Magna Cum Laude"}',
      0
    );

    // Employer verifies multiple credentials at once
    await credentialVerifier.connect(employer).requestVerification(
      "multi-verify-001",
      jacobDID,
      ["colby-diploma-jacob", "colby-honors-jacob"],
      48
    );

    await credentialVerifier.connect(jacob).approveVerification("multi-verify-001");
    await credentialVerifier.connect(employer).executeVerification("multi-verify-001");

    const results = await credentialVerifier.connect(employer).getVerificationResults("multi-verify-001");

    expect(results.length).to.equal(2);
    expect(results[0].isValid).to.be.true;
    expect(results[1].isValid).to.be.true;

    console.log("Multiple credentials verified in one request!");
  });

  it("Revoked credential should fail verification", async function () {
    const { didRegistry, credentialIssuer, credentialVerifier, admin, jacob, colbyCollege, employer } =
      await loadFixture(deployAllContractsFixture);

    const jacobDID = "did:jacob:revoke-test";
    await didRegistry.connect(jacob).createDID(jacobDID, "https://jacob.com");

    await credentialIssuer.registerIssuer(colbyCollege.address, "Colby College");
    const credId = "colby-revoked-cred";
    await credentialIssuer.connect(colbyCollege).issueCredential(
      credId, jacobDID, "Degree", '{}', 0
    );

    // Revoke the credential
    await credentialIssuer.connect(colbyCollege).revokeCredential(credId);

    // Attempt verification workflow
    await credentialVerifier.connect(employer).requestVerification(
      "verify-revoked", jacobDID, [credId], 24
    );
    await credentialVerifier.connect(jacob).approveVerification("verify-revoked");
    await credentialVerifier.connect(employer).executeVerification("verify-revoked");

    const results = await credentialVerifier.getVerificationResults("verify-revoked");
    expect(results[0].isValid).to.be.false;

    console.log("Revoked credential correctly flagged as invalid!");
  });

  it("Admin transfer workflow", async function () {
    const { credentialIssuer, admin, jacob } = await loadFixture(deployAllContractsFixture);

    // Two-step admin transfer
    await credentialIssuer.connect(admin).transferAdmin(jacob.address);
    expect(await credentialIssuer.admin()).to.equal(admin.address);

    await credentialIssuer.connect(jacob).acceptAdmin();
    expect(await credentialIssuer.admin()).to.equal(jacob.address);

    console.log("Admin transfer completed via two-step process!");
  });

  it("DID controller transfer workflow", async function () {
    const { didRegistry, credentialVerifier, credentialIssuer, admin, jacob, colbyCollege, employer } =
      await loadFixture(deployAllContractsFixture);

    const jacobDID = "did:jacob:transfer-test";
    const [, , , , newOwner] = await ethers.getSigners();

    await didRegistry.connect(jacob).createDID(jacobDID, "ep");

    // Register issuer and issue credential
    await credentialIssuer.registerIssuer(colbyCollege.address, "Colby College");
    await credentialIssuer.connect(colbyCollege).issueCredential(
      "cred-transfer", jacobDID, "Degree", '{}', 0
    );

    // Transfer DID controller
    await didRegistry.connect(jacob).transferController(jacobDID, newOwner.address);

    // New owner should be able to approve verifications
    await credentialVerifier.connect(employer).requestVerification(
      "req-after-transfer", jacobDID, ["cred-transfer"], 24
    );
    await credentialVerifier.connect(newOwner).approveVerification("req-after-transfer");
    await credentialVerifier.connect(employer).executeVerification("req-after-transfer");

    const results = await credentialVerifier.getVerificationResults("req-after-transfer");
    expect(results[0].isValid).to.be.true;

    // Old owner cannot approve
    await credentialVerifier.connect(employer).requestVerification(
      "req-old-owner", jacobDID, ["cred-transfer"], 24
    );
    await expect(
      credentialVerifier.connect(jacob).approveVerification("req-old-owner")
    ).to.be.revertedWith("Only DID controller can approve verification");

    console.log("DID controller transfer verified in full workflow!");
  });
});
