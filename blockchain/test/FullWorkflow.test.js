const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Complete Credential Vault Workflow", function () {
  let didRegistry, credentialIssuer, credentialVerifier;
  let admin, jacob, colbyCollege, employer;

  beforeEach(async function () {
    [admin, jacob, colbyCollege, employer] = await ethers.getSigners();

    // Deploy all contracts
    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    didRegistry = await DIDRegistry.deploy();

    const CredentialIssuer = await ethers.getContractFactory("CredentialIssuer");
    credentialIssuer = await CredentialIssuer.deploy();

    const CredentialVerifier = await ethers.getContractFactory("CredentialVerifier");
    credentialVerifier = await CredentialVerifier.deploy(didRegistry.target, credentialIssuer.target);
  });

  it("Complete Jacob's Credential Journey", async function () {
    // 1. Jacob creates his DID
    const jacobDID = "did:jacob:main";
    await didRegistry.connect(jacob).createDID(
      jacobDID,
      "jacob-public-key-123",
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

    // 6. Execute verification
    await credentialVerifier.executeVerification(requestId);

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

    console.log("🎓 Jacob's Colby College diploma verified successfully!");
    console.log("🏢 Employer can instantly trust the credential!");
    console.log("⚡ No phone calls, no waiting - instant verification!");
  });

  it("Multiple credentials workflow", async function () {
    const jacobDID = "did:jacob:portfolio";
    
    // Jacob creates DID
    await didRegistry.connect(jacob).createDID(jacobDID, "key-456", "https://jacob.com");
    
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
    await credentialVerifier.executeVerification("multi-verify-001");

    const results = await credentialVerifier.connect(employer).getVerificationResults("multi-verify-001");
    
    expect(results.length).to.equal(2);
    expect(results[0].isValid).to.be.true;
    expect(results[1].isValid).to.be.true;

    console.log("✨ Multiple credentials verified in one request!");
  });
});
