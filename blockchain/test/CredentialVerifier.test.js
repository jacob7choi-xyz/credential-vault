const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CredentialVerifier", function () {
  async function deployFixture() {
    const [admin, issuer, holder, employer, other] = await ethers.getSigners();

    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();

    const CredentialIssuer = await ethers.getContractFactory("CredentialIssuer");
    const credentialIssuer = await CredentialIssuer.connect(admin).deploy(didRegistry.target);

    const CredentialVerifier = await ethers.getContractFactory("CredentialVerifier");
    const credentialVerifier = await CredentialVerifier.deploy(didRegistry.target, credentialIssuer.target);

    return { didRegistry, credentialIssuer, credentialVerifier, admin, issuer, holder, employer, other };
  }

  async function deployWithCredentialFixture() {
    const fixture = await loadFixture(deployFixture);
    const { didRegistry, credentialIssuer, admin, issuer, holder } = fixture;

    const holderDID = "did:holder:main";
    await didRegistry.connect(holder).createDID(holderDID, "https://holder.com");

    await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Test University");
    const credentialId = "cred-001";
    await credentialIssuer.connect(issuer).issueCredential(
      credentialId, holderDID, "Bachelor's Degree", '{"major":"CS"}', 0
    );

    return { ...fixture, holderDID, credentialId };
  }

  async function deployWithRequestFixture() {
    const fixture = await loadFixture(deployWithCredentialFixture);
    const { credentialVerifier, employer, holderDID, credentialId } = fixture;

    const requestId = "req-001";
    await credentialVerifier.connect(employer).requestVerification(
      requestId, holderDID, [credentialId], 24
    );

    return { ...fixture, requestId };
  }

  async function deployWithApprovedRequestFixture() {
    const fixture = await loadFixture(deployWithRequestFixture);
    const { credentialVerifier, holder, requestId } = fixture;

    await credentialVerifier.connect(holder).approveVerification(requestId);

    return fixture;
  }

  describe("constructor", function () {
    it("should set the DIDRegistry and CredentialIssuer references", async function () {
      const { credentialVerifier, didRegistry, credentialIssuer } = await loadFixture(deployFixture);

      expect(await credentialVerifier.didRegistry()).to.equal(didRegistry.target);
      expect(await credentialVerifier.credentialIssuer()).to.equal(credentialIssuer.target);
    });

    it("should revert if DIDRegistry address is zero", async function () {
      const { credentialIssuer } = await loadFixture(deployFixture);
      const CredentialVerifier = await ethers.getContractFactory("CredentialVerifier");

      await expect(
        CredentialVerifier.deploy(ethers.ZeroAddress, credentialIssuer.target)
      ).to.be.revertedWith("DIDRegistry address cannot be zero");
    });

    it("should revert if CredentialIssuer address is zero", async function () {
      const { didRegistry } = await loadFixture(deployFixture);
      const CredentialVerifier = await ethers.getContractFactory("CredentialVerifier");

      await expect(
        CredentialVerifier.deploy(didRegistry.target, ethers.ZeroAddress)
      ).to.be.revertedWith("CredentialIssuer address cannot be zero");
    });
  });

  describe("requestVerification", function () {
    it("should create a verification request", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);
      const requestId = "req-new";

      await credentialVerifier.connect(employer).requestVerification(
        requestId, holderDID, [credentialId], 24
      );

      const req = await credentialVerifier.verificationRequests(requestId);
      expect(req.requestId).to.equal(requestId);
      expect(req.employer).to.equal(employer.address);
      expect(req.candidateDID).to.equal(holderDID);
      expect(req.isApproved).to.be.false;
      expect(req.isCompleted).to.be.false;
    });

    it("should set correct expiration date based on validForHours", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      const tx = await credentialVerifier.connect(employer).requestVerification(
        "req-exp", holderDID, [credentialId], 48
      );
      const block = await ethers.provider.getBlock(tx.blockNumber);

      const req = await credentialVerifier.verificationRequests("req-exp");
      expect(req.expirationDate).to.equal(block.timestamp + 48 * 3600);
    });

    it("should add request to employer requests", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialVerifier.connect(employer).requestVerification(
        "req-emp", holderDID, [credentialId], 24
      );

      const requests = await credentialVerifier.getEmployerRequests(employer.address);
      expect(requests.length).to.equal(1);
      expect(requests[0]).to.equal("req-emp");
    });

    it("should add request to candidate requests", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialVerifier.connect(employer).requestVerification(
        "req-cand", holderDID, [credentialId], 24
      );

      const requests = await credentialVerifier.getCandidateRequests(holderDID);
      expect(requests.length).to.equal(1);
      expect(requests[0]).to.equal("req-cand");
    });

    it("should emit VerificationRequested event", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-evt", holderDID, [credentialId], 24)
      ).to.emit(credentialVerifier, "VerificationRequested");
    });

    it("should revert if request ID is empty", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("", holderDID, [credentialId], 24)
      ).to.be.revertedWith("Request ID required");
    });

    it("should revert if candidate DID is empty", async function () {
      const { credentialVerifier, employer, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-1", "", [credentialId], 24)
      ).to.be.revertedWith("Candidate DID required");
    });

    it("should revert if no credentials requested", async function () {
      const { credentialVerifier, employer, holderDID } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-1", holderDID, [], 24)
      ).to.be.revertedWith("Must request at least one credential");
    });

    it("should revert if too many credentials requested", async function () {
      const { credentialVerifier, employer, holderDID } = await loadFixture(deployWithCredentialFixture);

      const tooMany = Array.from({ length: 51 }, (_, i) => `cred-${i}`);
      await expect(
        credentialVerifier.connect(employer).requestVerification("req-1", holderDID, tooMany, 24)
      ).to.be.revertedWith("Too many credentials requested");
    });

    it("should revert if request ID already exists", async function () {
      const { credentialVerifier, employer, holderDID, credentialId, requestId } = await loadFixture(deployWithRequestFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification(requestId, holderDID, [credentialId], 24)
      ).to.be.revertedWith("Request ID already exists");
    });

    it("should revert if validForHours is 0", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-0h", holderDID, [credentialId], 0)
      ).to.be.revertedWith("Valid hours must be between 1 and 8760");
    });

    it("should revert if validForHours exceeds maximum", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-big", holderDID, [credentialId], 8761)
      ).to.be.revertedWith("Valid hours must be between 1 and 8760");
    });

    it("should accept boundary value of 1 hour", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-1h", holderDID, [credentialId], 1)
      ).to.not.be.reverted;
    });

    it("should revert if candidate DID does not exist in registry", async function () {
      const { credentialVerifier, employer, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-phantom", "did:nonexistent:xyz", [credentialId], 24)
      ).to.be.revertedWith("Candidate DID is not active");
    });

    it("should accept boundary value of 8760 hours", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialVerifier.connect(employer).requestVerification("req-max", holderDID, [credentialId], 8760)
      ).to.not.be.reverted;
    });

    it("should accept exactly 50 credentials", async function () {
      const { credentialVerifier, employer, holderDID } = await loadFixture(deployWithCredentialFixture);

      const fiftyCredentials = Array.from({ length: 50 }, (_, i) => `cred-${i}`);
      await expect(
        credentialVerifier.connect(employer).requestVerification("req-50", holderDID, fiftyCredentials, 24)
      ).to.not.be.reverted;
    });
  });

  describe("approveVerification", function () {
    it("should approve a verification request", async function () {
      const { credentialVerifier, holder, requestId } = await loadFixture(deployWithRequestFixture);

      await credentialVerifier.connect(holder).approveVerification(requestId);

      const req = await credentialVerifier.verificationRequests(requestId);
      expect(req.isApproved).to.be.true;
    });

    it("should emit VerificationApproved event", async function () {
      const { credentialVerifier, holder, requestId } = await loadFixture(deployWithRequestFixture);

      await expect(credentialVerifier.connect(holder).approveVerification(requestId))
        .to.emit(credentialVerifier, "VerificationApproved");
    });

    it("should revert if request does not exist", async function () {
      const { credentialVerifier, holder } = await loadFixture(deployFixture);

      await expect(
        credentialVerifier.connect(holder).approveVerification("nonexistent")
      ).to.be.revertedWith("Request does not exist");
    });

    it("should revert if already approved", async function () {
      const { credentialVerifier, holder, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await expect(
        credentialVerifier.connect(holder).approveVerification(requestId)
      ).to.be.revertedWith("Request already approved");
    });

    it("should revert if request has expired", async function () {
      const { credentialVerifier, holder, requestId } = await loadFixture(deployWithRequestFixture);

      // Fast forward past expiration (24 hours + 1 second)
      await time.increase(24 * 3600 + 1);

      await expect(
        credentialVerifier.connect(holder).approveVerification(requestId)
      ).to.be.revertedWith("Request has expired");
    });

    it("should revert if caller is not the DID controller", async function () {
      const { credentialVerifier, other, requestId } = await loadFixture(deployWithRequestFixture);

      await expect(
        credentialVerifier.connect(other).approveVerification(requestId)
      ).to.be.revertedWith("Only DID controller can approve verification");
    });

    it("should revert if employer tries to approve their own request", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithRequestFixture);

      await expect(
        credentialVerifier.connect(employer).approveVerification(requestId)
      ).to.be.revertedWith("Only DID controller can approve verification");
    });
  });

  describe("executeVerification", function () {
    it("should execute verification and mark as completed", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await credentialVerifier.connect(employer).executeVerification(requestId);

      const req = await credentialVerifier.verificationRequests(requestId);
      expect(req.isCompleted).to.be.true;
    });

    it("should store verification results", async function () {
      const { credentialVerifier, employer, requestId, credentialId } = await loadFixture(deployWithApprovedRequestFixture);

      await credentialVerifier.connect(employer).executeVerification(requestId);

      const results = await credentialVerifier.getVerificationResults(requestId);
      expect(results.length).to.equal(1);
      expect(results[0].credentialId).to.equal(credentialId);
      expect(results[0].isValid).to.be.true;
      expect(results[0].isAuthentic).to.be.true;
      expect(results[0].issuerName).to.equal("Test University");
    });

    it("should emit CredentialVerified event for each credential", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await expect(credentialVerifier.connect(employer).executeVerification(requestId))
        .to.emit(credentialVerifier, "CredentialVerified");
    });

    it("should emit VerificationCompleted event", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await expect(credentialVerifier.connect(employer).executeVerification(requestId))
        .to.emit(credentialVerifier, "VerificationCompleted");
    });

    it("should revert if request does not exist", async function () {
      const { credentialVerifier, employer } = await loadFixture(deployFixture);

      await expect(
        credentialVerifier.connect(employer).executeVerification("nonexistent")
      ).to.be.revertedWith("Request does not exist");
    });

    it("should revert if caller is not the requesting employer", async function () {
      const { credentialVerifier, other, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await expect(
        credentialVerifier.connect(other).executeVerification(requestId)
      ).to.be.revertedWith("Only the requesting employer can execute verification");
    });

    it("should revert if request is not approved", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithRequestFixture);

      await expect(
        credentialVerifier.connect(employer).executeVerification(requestId)
      ).to.be.revertedWith("Request not approved by candidate");
    });

    it("should revert if request is already completed", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await credentialVerifier.connect(employer).executeVerification(requestId);
      await expect(
        credentialVerifier.connect(employer).executeVerification(requestId)
      ).to.be.revertedWith("Request already completed");
    });

    it("should revert if request has expired", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await time.increase(24 * 3600 + 1);

      await expect(
        credentialVerifier.connect(employer).executeVerification(requestId)
      ).to.be.revertedWith("Request has expired");
    });

    it("should mark credential as invalid if it belongs to a different holder", async function () {
      const {
        didRegistry, credentialIssuer, credentialVerifier,
        admin, issuer, employer, other
      } = await loadFixture(deployFixture);

      // Create two DIDs
      const did1 = "did:person:one";
      const did2 = "did:person:two";
      const [, , holder1, , holder2] = await ethers.getSigners();

      await didRegistry.connect(holder1).createDID(did1, "ep1");
      await didRegistry.connect(holder2).createDID(did2, "ep2");

      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");
      await credentialIssuer.connect(issuer).issueCredential("cred-for-one", did1, "Degree", "{}", 0);

      // Request verification of holder1's credential for holder2
      await credentialVerifier.connect(employer).requestVerification(
        "req-wrong", did2, ["cred-for-one"], 24
      );
      await credentialVerifier.connect(holder2).approveVerification("req-wrong");
      await credentialVerifier.connect(employer).executeVerification("req-wrong");

      const results = await credentialVerifier.getVerificationResults("req-wrong");
      expect(results[0].isValid).to.be.false;
    });

    it("should mark revoked credential as invalid", async function () {
      const {
        credentialIssuer, credentialVerifier,
        issuer, employer, holder,
        holderDID, credentialId
      } = await loadFixture(deployWithCredentialFixture);

      // Revoke the credential
      await credentialIssuer.connect(issuer).revokeCredential(credentialId);

      // Request and approve
      await credentialVerifier.connect(employer).requestVerification(
        "req-revoked", holderDID, [credentialId], 24
      );
      await credentialVerifier.connect(holder).approveVerification("req-revoked");
      await credentialVerifier.connect(employer).executeVerification("req-revoked");

      const results = await credentialVerifier.getVerificationResults("req-revoked");
      expect(results[0].isValid).to.be.false;
    });
  });

  describe("edge cases - privacy and consent gate", function () {
    it("should revert execution when request expires between approval and execution", async function () {
      const { credentialVerifier, credentialIssuer, didRegistry, admin, issuer, employer, holder } = await loadFixture(deployFixture);

      // Set up DID and credential
      const holderDID = "did:holder:expiry";
      await didRegistry.connect(holder).createDID(holderDID, "ep");
      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");
      await credentialIssuer.connect(issuer).issueCredential("cred-exp", holderDID, "Degree", "{}", 0);

      // Request with short validity (1 hour)
      await credentialVerifier.connect(employer).requestVerification(
        "req-expiry", holderDID, ["cred-exp"], 1
      );

      // Approve at minute 50 (before expiry)
      await time.increase(50 * 60);
      await credentialVerifier.connect(holder).approveVerification("req-expiry");

      // Try to execute at minute 70 (after expiry)
      await time.increase(20 * 60);
      await expect(
        credentialVerifier.connect(employer).executeVerification("req-expiry")
      ).to.be.revertedWith("Request has expired");
    });

    it("should revert approval when DID is deactivated after request creation", async function () {
      const { credentialVerifier, credentialIssuer, didRegistry, admin, issuer, employer, holder } = await loadFixture(deployFixture);

      const holderDID = "did:holder:deact";
      await didRegistry.connect(holder).createDID(holderDID, "ep");
      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");
      await credentialIssuer.connect(issuer).issueCredential("cred-deact", holderDID, "Degree", "{}", 0);

      // Employer creates request while DID is active
      await credentialVerifier.connect(employer).requestVerification(
        "req-deact", holderDID, ["cred-deact"], 24
      );

      // Holder deactivates their DID
      await didRegistry.connect(holder).deactivateDID(holderDID);

      // Approval should fail because verifyDIDController returns false for deactivated DIDs
      await expect(
        credentialVerifier.connect(holder).approveVerification("req-deact")
      ).to.be.revertedWith("Only DID controller can approve verification");
    });

    it("should allow multiple employers to independently verify the same credentials", async function () {
      const { credentialVerifier, credentialIssuer, didRegistry, admin, issuer, holder } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const employer1 = signers[5];
      const employer2 = signers[6];

      const holderDID = "did:holder:multi";
      await didRegistry.connect(holder).createDID(holderDID, "ep");
      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");
      await credentialIssuer.connect(issuer).issueCredential("cred-multi", holderDID, "Degree", "{}", 0);

      // Two employers request the same credential
      await credentialVerifier.connect(employer1).requestVerification(
        "req-emp1", holderDID, ["cred-multi"], 24
      );
      await credentialVerifier.connect(employer2).requestVerification(
        "req-emp2", holderDID, ["cred-multi"], 24
      );

      // Holder approves both
      await credentialVerifier.connect(holder).approveVerification("req-emp1");
      await credentialVerifier.connect(holder).approveVerification("req-emp2");

      // Both employers execute independently
      await credentialVerifier.connect(employer1).executeVerification("req-emp1");
      await credentialVerifier.connect(employer2).executeVerification("req-emp2");

      // Both get valid results
      const results1 = await credentialVerifier.getVerificationResults("req-emp1");
      const results2 = await credentialVerifier.getVerificationResults("req-emp2");
      expect(results1[0].isValid).to.be.true;
      expect(results2[0].isValid).to.be.true;

      // Employer1 cannot execute employer2's request
      await expect(
        credentialVerifier.connect(employer1).executeVerification("req-emp2")
      ).to.be.revertedWith("Only the requesting employer can execute verification");
    });

    it("should allow same employer to re-request after a completed verification", async function () {
      const { credentialVerifier, employer, holder, holderDID, credentialId } = await loadFixture(deployWithApprovedRequestFixture);

      // Complete first request
      await credentialVerifier.connect(employer).executeVerification("req-001");

      // Same employer, same credentials, new request ID
      await credentialVerifier.connect(employer).requestVerification(
        "req-002", holderDID, [credentialId], 24
      );
      await credentialVerifier.connect(holder).approveVerification("req-002");
      await credentialVerifier.connect(employer).executeVerification("req-002");

      const results = await credentialVerifier.getVerificationResults("req-002");
      expect(results[0].isValid).to.be.true;
      expect(results[0].credentialId).to.equal(credentialId);

      // Employer now has two requests tracked
      const requests = await credentialVerifier.getEmployerRequests(employer.address);
      expect(requests.length).to.equal(2);
    });

    it("should revert approval on an already completed request (isApproved fires first)", async function () {
      const { credentialVerifier, employer, holder, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      // Complete the request
      await credentialVerifier.connect(employer).executeVerification(requestId);

      // Try to approve again -- hits "already approved" before "already completed"
      // because a completed request is always also approved
      await expect(
        credentialVerifier.connect(holder).approveVerification(requestId)
      ).to.be.revertedWith("Request already approved");
    });

    it("should mark expired credential as invalid at execution time", async function () {
      const { credentialVerifier, credentialIssuer, didRegistry, admin, issuer, holder } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const employer = signers[5];

      const holderDID = "did:holder:credexp";
      await didRegistry.connect(holder).createDID(holderDID, "ep");
      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");

      // Issue credential that expires in 2 hours
      const now = await time.latest();
      const expiresAt = now + 2 * 3600;
      await credentialIssuer.connect(issuer).issueCredential(
        "cred-expiring", holderDID, "Certificate", "{}", expiresAt
      );

      // Request and approve while credential is still valid
      await credentialVerifier.connect(employer).requestVerification(
        "req-credexp", holderDID, ["cred-expiring"], 24
      );
      await credentialVerifier.connect(holder).approveVerification("req-credexp");

      // Fast forward past credential expiration but before request expiration
      await time.increase(3 * 3600);

      // Execute -- should succeed but mark credential as invalid (not revert)
      await credentialVerifier.connect(employer).executeVerification("req-credexp");

      const results = await credentialVerifier.getVerificationResults("req-credexp");
      expect(results[0].isValid).to.be.false;
      expect(results[0].isAuthentic).to.be.true; // Credential exists, just expired
    });

    it("should mark non-existent credential as invalid instead of reverting", async function () {
      const { credentialVerifier, didRegistry, holder } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const employer = signers[5];

      const holderDID = "did:holder:phantom";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      // Request verification of a credential that was never issued
      await credentialVerifier.connect(employer).requestVerification(
        "req-phantom", holderDID, ["cred-never-issued"], 24
      );
      await credentialVerifier.connect(holder).approveVerification("req-phantom");
      await credentialVerifier.connect(employer).executeVerification("req-phantom");

      // Should produce a result with isValid=false, not revert
      const results = await credentialVerifier.getVerificationResults("req-phantom");
      expect(results.length).to.equal(1);
      expect(results[0].isValid).to.be.false;
      expect(results[0].isAuthentic).to.be.false;
    });

    it("should allow new controller to approve after DID transfer mid-flow", async function () {
      const { credentialVerifier, credentialIssuer, didRegistry, admin, issuer, holder } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const employer = signers[5];
      const newController = signers[6];

      const holderDID = "did:holder:transfer";
      await didRegistry.connect(holder).createDID(holderDID, "ep");
      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");
      await credentialIssuer.connect(issuer).issueCredential("cred-xfer", holderDID, "Degree", "{}", 0);

      // Employer creates request
      await credentialVerifier.connect(employer).requestVerification(
        "req-xfer", holderDID, ["cred-xfer"], 24
      );

      // Holder transfers DID to new controller
      await didRegistry.connect(holder).transferController(holderDID, newController.address);

      // Old controller can no longer approve
      await expect(
        credentialVerifier.connect(holder).approveVerification("req-xfer")
      ).to.be.revertedWith("Only DID controller can approve verification");

      // New controller can approve
      await credentialVerifier.connect(newController).approveVerification("req-xfer");

      // Verification still works
      await credentialVerifier.connect(employer).executeVerification("req-xfer");
      const results = await credentialVerifier.getVerificationResults("req-xfer");
      expect(results[0].isValid).to.be.true;
    });

    it("should prevent employer from executing another employer's approved request", async function () {
      const { credentialVerifier, credentialIssuer, didRegistry, admin, issuer, holder } = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      const employer1 = signers[5];
      const employer2 = signers[6];

      const holderDID = "did:holder:access";
      await didRegistry.connect(holder).createDID(holderDID, "ep");
      await credentialIssuer.connect(admin).registerIssuer(issuer.address, "Uni");
      await credentialIssuer.connect(issuer).issueCredential("cred-access", holderDID, "Degree", "{}", 0);

      // Employer1 creates request, holder approves
      await credentialVerifier.connect(employer1).requestVerification(
        "req-private", holderDID, ["cred-access"], 24
      );
      await credentialVerifier.connect(holder).approveVerification("req-private");

      // Employer2 tries to execute employer1's approved request
      await expect(
        credentialVerifier.connect(employer2).executeVerification("req-private")
      ).to.be.revertedWith("Only the requesting employer can execute verification");
    });
  });

  describe("quickVerify", function () {
    it("should return valid for an existing valid credential", async function () {
      const { credentialVerifier, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      const [isValid, issuerName, credType, holder] = await credentialVerifier.quickVerify(credentialId);
      expect(isValid).to.be.true;
      expect(issuerName).to.equal("Test University");
      expect(credType).to.equal("Bachelor's Degree");
      expect(holder).to.equal(holderDID);
    });

    it("should return invalid for a non-existent credential", async function () {
      const { credentialVerifier } = await loadFixture(deployFixture);

      const [isValid, issuerName, , holderDID] = await credentialVerifier.quickVerify("nonexistent");
      expect(isValid).to.be.false;
      expect(issuerName).to.equal("");
      expect(holderDID).to.equal("");
    });

    it("should return invalid for a revoked credential", async function () {
      const { credentialIssuer, credentialVerifier, issuer, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialIssuer.connect(issuer).revokeCredential(credentialId);

      const [isValid, , , ] = await credentialVerifier.quickVerify(credentialId);
      expect(isValid).to.be.false;
    });
  });

  describe("getVerificationResults", function () {
    it("should return results for a completed request", async function () {
      const { credentialVerifier, employer, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await credentialVerifier.connect(employer).executeVerification(requestId);

      const results = await credentialVerifier.getVerificationResults(requestId);
      expect(results.length).to.equal(1);
    });

    it("should revert if request does not exist", async function () {
      const { credentialVerifier } = await loadFixture(deployFixture);

      await expect(
        credentialVerifier.getVerificationResults("nonexistent")
      ).to.be.revertedWith("Request does not exist");
    });

    it("should revert if verification not completed yet", async function () {
      const { credentialVerifier, requestId } = await loadFixture(deployWithApprovedRequestFixture);

      await expect(
        credentialVerifier.getVerificationResults(requestId)
      ).to.be.revertedWith("Verification not completed yet");
    });
  });

  describe("getEmployerRequests", function () {
    it("should return empty array for employer with no requests", async function () {
      const { credentialVerifier, other } = await loadFixture(deployFixture);

      const requests = await credentialVerifier.getEmployerRequests(other.address);
      expect(requests.length).to.equal(0);
    });

    it("should return all request IDs for an employer", async function () {
      const { credentialVerifier, employer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialVerifier.connect(employer).requestVerification("req-a", holderDID, [credentialId], 24);
      await credentialVerifier.connect(employer).requestVerification("req-b", holderDID, [credentialId], 24);

      const requests = await credentialVerifier.getEmployerRequests(employer.address);
      expect(requests.length).to.equal(2);
      expect(requests[0]).to.equal("req-a");
      expect(requests[1]).to.equal("req-b");
    });
  });

  describe("getCandidateRequests", function () {
    it("should return empty array for candidate with no requests", async function () {
      const { credentialVerifier } = await loadFixture(deployFixture);

      const requests = await credentialVerifier.getCandidateRequests("did:nobody");
      expect(requests.length).to.equal(0);
    });

    it("should return all request IDs for a candidate", async function () {
      const { credentialVerifier, employer, other, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialVerifier.connect(employer).requestVerification("req-c1", holderDID, [credentialId], 24);
      await credentialVerifier.connect(other).requestVerification("req-c2", holderDID, [credentialId], 24);

      const requests = await credentialVerifier.getCandidateRequests(holderDID);
      expect(requests.length).to.equal(2);
    });
  });
});
