const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CredentialIssuer", function () {
  async function deployFixture() {
    const [admin, issuer1, issuer2, holder, other] = await ethers.getSigners();

    const DIDRegistry = await ethers.getContractFactory("DIDRegistry");
    const didRegistry = await DIDRegistry.deploy();

    const CredentialIssuer = await ethers.getContractFactory("CredentialIssuer");
    const credentialIssuer = await CredentialIssuer.connect(admin).deploy(didRegistry.target);

    return { didRegistry, credentialIssuer, admin, issuer1, issuer2, holder, other };
  }

  async function deployWithIssuerFixture() {
    const fixture = await loadFixture(deployFixture);
    const { credentialIssuer, admin, issuer1 } = fixture;

    await credentialIssuer.connect(admin).registerIssuer(issuer1.address, "Test University");

    return { ...fixture, institutionName: "Test University" };
  }

  async function deployWithCredentialFixture() {
    const fixture = await loadFixture(deployWithIssuerFixture);
    const { didRegistry, credentialIssuer, issuer1, holder } = fixture;

    const holderDID = "did:holder:123";
    await didRegistry.connect(holder).createDID(holderDID, "https://holder.com");

    const credentialId = "cred-001";
    await credentialIssuer.connect(issuer1).issueCredential(
      credentialId,
      holderDID,
      "Bachelor's Degree",
      '{"major": "CS"}',
      0
    );

    return { ...fixture, holderDID, credentialId };
  }

  describe("constructor", function () {
    it("should set admin to deployer", async function () {
      const { credentialIssuer, admin } = await loadFixture(deployFixture);
      expect(await credentialIssuer.admin()).to.equal(admin.address);
    });

    it("should set the DIDRegistry reference", async function () {
      const { credentialIssuer, didRegistry } = await loadFixture(deployFixture);
      expect(await credentialIssuer.didRegistry()).to.equal(didRegistry.target);
    });

    it("should revert if DIDRegistry address is zero", async function () {
      const CredentialIssuer = await ethers.getContractFactory("CredentialIssuer");
      await expect(
        CredentialIssuer.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("DIDRegistry address cannot be zero");
    });
  });

  describe("transferAdmin", function () {
    it("should set pending admin", async function () {
      const { credentialIssuer, admin, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);
      expect(await credentialIssuer.pendingAdmin()).to.equal(other.address);
    });

    it("should emit AdminTransferRequested event", async function () {
      const { credentialIssuer, admin, other } = await loadFixture(deployFixture);

      await expect(credentialIssuer.connect(admin).transferAdmin(other.address))
        .to.emit(credentialIssuer, "AdminTransferRequested");
    });

    it("should not change admin immediately", async function () {
      const { credentialIssuer, admin, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);
      expect(await credentialIssuer.admin()).to.equal(admin.address);
    });

    it("should revert if caller is not admin", async function () {
      const { credentialIssuer, other } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(other).transferAdmin(other.address)
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("should revert if new admin is zero address", async function () {
      const { credentialIssuer, admin } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).transferAdmin(ethers.ZeroAddress)
      ).to.be.revertedWith("New admin cannot be zero address");
    });

    it("should revert if new admin is same as current", async function () {
      const { credentialIssuer, admin } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).transferAdmin(admin.address)
      ).to.be.revertedWith("New admin must be different");
    });
  });

  describe("acceptAdmin", function () {
    it("should transfer admin to pending admin", async function () {
      const { credentialIssuer, admin, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);
      await credentialIssuer.connect(other).acceptAdmin();

      expect(await credentialIssuer.admin()).to.equal(other.address);
      expect(await credentialIssuer.pendingAdmin()).to.equal(ethers.ZeroAddress);
    });

    it("should emit AdminTransferred event", async function () {
      const { credentialIssuer, admin, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);

      await expect(credentialIssuer.connect(other).acceptAdmin())
        .to.emit(credentialIssuer, "AdminTransferred");
    });

    it("should revert if caller is not pending admin", async function () {
      const { credentialIssuer, admin, issuer1, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);

      await expect(
        credentialIssuer.connect(issuer1).acceptAdmin()
      ).to.be.revertedWith("Only pending admin can accept");
    });

    it("should revert if no pending admin set", async function () {
      const { credentialIssuer, admin } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).acceptAdmin()
      ).to.be.revertedWith("Only pending admin can accept");
    });

    it("should allow new admin to perform admin actions", async function () {
      const { credentialIssuer, admin, issuer1, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);
      await credentialIssuer.connect(other).acceptAdmin();

      await expect(
        credentialIssuer.connect(other).registerIssuer(issuer1.address, "New Institution")
      ).to.not.be.reverted;
    });

    it("should prevent old admin from performing admin actions", async function () {
      const { credentialIssuer, admin, issuer1, other } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).transferAdmin(other.address);
      await credentialIssuer.connect(other).acceptAdmin();

      await expect(
        credentialIssuer.connect(admin).registerIssuer(issuer1.address, "Institution")
      ).to.be.revertedWith("Only admin can perform this action");
    });
  });

  describe("registerIssuer", function () {
    it("should register an issuer successfully", async function () {
      const { credentialIssuer, admin, issuer1 } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).registerIssuer(issuer1.address, "MIT");

      expect(await credentialIssuer.authorizedIssuers(issuer1.address)).to.be.true;
      expect(await credentialIssuer.registeredIssuers(issuer1.address)).to.equal("MIT");
    });

    it("should emit IssuerRegistered event", async function () {
      const { credentialIssuer, admin, issuer1 } = await loadFixture(deployFixture);

      await expect(credentialIssuer.connect(admin).registerIssuer(issuer1.address, "MIT"))
        .to.emit(credentialIssuer, "IssuerRegistered")
        .withArgs(issuer1.address, "MIT", await time.latest() + 1);
    });

    it("should revert if caller is not admin", async function () {
      const { credentialIssuer, issuer1, other } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(other).registerIssuer(issuer1.address, "MIT")
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("should revert if issuer address is zero", async function () {
      const { credentialIssuer, admin } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).registerIssuer(ethers.ZeroAddress, "MIT")
      ).to.be.revertedWith("Invalid issuer address");
    });

    it("should revert if institution name is empty", async function () {
      const { credentialIssuer, admin, issuer1 } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).registerIssuer(issuer1.address, "")
      ).to.be.revertedWith("Institution name required");
    });

    it("should allow re-registering (overwriting) an existing issuer", async function () {
      const { credentialIssuer, admin, issuer1 } = await loadFixture(deployFixture);

      await credentialIssuer.connect(admin).registerIssuer(issuer1.address, "MIT");
      await credentialIssuer.connect(admin).registerIssuer(issuer1.address, "Harvard");

      expect(await credentialIssuer.registeredIssuers(issuer1.address)).to.equal("Harvard");
    });
  });

  describe("deauthorizeIssuer", function () {
    it("should deauthorize an issuer", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await credentialIssuer.deauthorizeIssuer(issuer1.address);

      expect(await credentialIssuer.authorizedIssuers(issuer1.address)).to.be.false;
    });

    it("should emit IssuerDeauthorized event", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await expect(credentialIssuer.deauthorizeIssuer(issuer1.address))
        .to.emit(credentialIssuer, "IssuerDeauthorized");
    });

    it("should prevent deauthorized issuer from issuing credentials", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);

      await didRegistry.connect(holder).createDID("did:holder:1", "ep");
      await credentialIssuer.deauthorizeIssuer(issuer1.address);

      await expect(
        credentialIssuer.connect(issuer1).issueCredential("cred-1", "did:holder:1", "Degree", "{}", 0)
      ).to.be.revertedWith("Not authorized to issue credentials");
    });

    it("should revert if caller is not admin", async function () {
      const { credentialIssuer, issuer1, other } = await loadFixture(deployWithIssuerFixture);

      await expect(
        credentialIssuer.connect(other).deauthorizeIssuer(issuer1.address)
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("should revert if issuer address is zero", async function () {
      const { credentialIssuer, admin } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).deauthorizeIssuer(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid issuer address");
    });

    it("should revert if issuer is not currently authorized", async function () {
      const { credentialIssuer, admin, other } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.connect(admin).deauthorizeIssuer(other.address)
      ).to.be.revertedWith("Issuer not currently authorized");
    });

    it("should revert if issuer already deauthorized", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await credentialIssuer.deauthorizeIssuer(issuer1.address);
      await expect(
        credentialIssuer.deauthorizeIssuer(issuer1.address)
      ).to.be.revertedWith("Issuer not currently authorized");
    });

    it("should keep existing credentials valid after deauthorization", async function () {
      const { credentialIssuer, issuer1, credentialId } = await loadFixture(deployWithCredentialFixture);

      // Deauthorize the issuer
      await credentialIssuer.deauthorizeIssuer(issuer1.address);

      // Credential issued before deauthorization should still verify as valid
      const [exists, valid, institutionName] = await credentialIssuer.verifyCredential(credentialId);
      expect(exists).to.be.true;
      expect(valid).to.be.true;
      expect(institutionName).to.equal("Test University");
    });

    it("should allow re-authorized issuer to issue credentials again", async function () {
      const { credentialIssuer, didRegistry, admin, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:reauth";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      // Deauthorize then re-authorize
      await credentialIssuer.connect(admin).deauthorizeIssuer(issuer1.address);
      await credentialIssuer.connect(admin).registerIssuer(issuer1.address, "Test University");

      // Should be able to issue again
      await expect(
        credentialIssuer.connect(issuer1).issueCredential("cred-reauth", holderDID, "Degree", "{}", 0)
      ).to.not.be.reverted;
    });
  });

  describe("issueCredential", function () {
    it("should issue a credential successfully", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:1";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      await credentialIssuer.connect(issuer1).issueCredential(
        "cred-1", holderDID, "Degree", '{"major":"CS"}', 0
      );

      const cred = await credentialIssuer.getCredential("cred-1");
      expect(cred.credentialId).to.equal("cred-1");
      expect(cred.holderDID).to.equal(holderDID);
      expect(cred.issuerAddress).to.equal(issuer1.address);
      expect(cred.institutionName).to.equal("Test University");
      expect(cred.credentialType).to.equal("Degree");
      expect(cred.credentialData).to.equal('{"major":"CS"}');
      expect(cred.isRevoked).to.be.false;
      expect(cred.expirationDate).to.equal(0);
    });

    it("should issue a credential with expiration date", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:exp";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      const futureTime = (await time.latest()) + 365 * 24 * 60 * 60;
      await credentialIssuer.connect(issuer1).issueCredential(
        "cred-exp", holderDID, "Certification", "{}", futureTime
      );

      const cred = await credentialIssuer.getCredential("cred-exp");
      expect(cred.expirationDate).to.equal(futureTime);
    });

    it("should add credential to holder's credential list", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:list";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      await credentialIssuer.connect(issuer1).issueCredential("cred-a", holderDID, "Degree", "{}", 0);
      await credentialIssuer.connect(issuer1).issueCredential("cred-b", holderDID, "Honors", "{}", 0);

      const creds = await credentialIssuer.getHolderCredentials(holderDID);
      expect(creds.length).to.equal(2);
      expect(creds[0]).to.equal("cred-a");
      expect(creds[1]).to.equal("cred-b");
    });

    it("should emit CredentialIssued event", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:evt";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      await expect(
        credentialIssuer.connect(issuer1).issueCredential("cred-evt", holderDID, "Degree", "{}", 0)
      ).to.emit(credentialIssuer, "CredentialIssued");
    });

    it("should revert if caller is not an authorized issuer", async function () {
      const { credentialIssuer, didRegistry, other, holder } = await loadFixture(deployWithIssuerFixture);
      await didRegistry.connect(holder).createDID("did:h:1", "ep");

      await expect(
        credentialIssuer.connect(other).issueCredential("c-1", "did:h:1", "D", "{}", 0)
      ).to.be.revertedWith("Not authorized to issue credentials");
    });

    it("should revert if credential ID is empty", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      await didRegistry.connect(holder).createDID("did:h:2", "ep");

      await expect(
        credentialIssuer.connect(issuer1).issueCredential("", "did:h:2", "D", "{}", 0)
      ).to.be.revertedWith("Credential ID required");
    });

    it("should revert if holder DID is empty", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await expect(
        credentialIssuer.connect(issuer1).issueCredential("c-2", "", "D", "{}", 0)
      ).to.be.revertedWith("Holder DID required");
    });

    it("should revert if credential type is empty", async function () {
      const { credentialIssuer, issuer1, holderDID } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialIssuer.connect(issuer1).issueCredential("cred-notype", holderDID, "", "{}", 0)
      ).to.be.revertedWith("Credential type required");
    });

    it("should revert if credential already exists", async function () {
      const { credentialIssuer, credentialId, issuer1, holderDID } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialIssuer.connect(issuer1).issueCredential(credentialId, holderDID, "Another", "{}", 0)
      ).to.be.revertedWith("Credential already exists");
    });

    it("should revert if expiration date is in the past", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      await didRegistry.connect(holder).createDID("did:h:past", "ep");

      const pastTime = (await time.latest()) - 100;
      await expect(
        credentialIssuer.connect(issuer1).issueCredential("c-past", "did:h:past", "D", "{}", pastTime)
      ).to.be.revertedWith("Expiration must be in the future");
    });

    it("should revert if holder DID does not exist in registry", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await expect(
        credentialIssuer.connect(issuer1).issueCredential("c-3", "did:nonexistent", "D", "{}", 0)
      ).to.be.revertedWith("Holder DID is not active");
    });

    it("should revert if holder DID is deactivated", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:deactivated";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      // Deactivate the DID
      await didRegistry.connect(holder).deactivateDID(holderDID);

      // Attempting to issue to a deactivated DID should fail
      await expect(
        credentialIssuer.connect(issuer1).issueCredential("cred-dead", holderDID, "Degree", "{}", 0)
      ).to.be.revertedWith("Holder DID is not active");
    });
  });

  describe("revokeCredential", function () {
    it("should revoke a credential", async function () {
      const { credentialIssuer, issuer1, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialIssuer.connect(issuer1).revokeCredential(credentialId);

      const cred = await credentialIssuer.getCredential(credentialId);
      expect(cred.isRevoked).to.be.true;
    });

    it("should emit CredentialRevoked event", async function () {
      const { credentialIssuer, issuer1, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(credentialIssuer.connect(issuer1).revokeCredential(credentialId))
        .to.emit(credentialIssuer, "CredentialRevoked");
    });

    it("should revert if credential does not exist", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await expect(
        credentialIssuer.connect(issuer1).revokeCredential("nonexistent")
      ).to.be.revertedWith("Credential does not exist");
    });

    it("should revert if caller is not the original issuer", async function () {
      const { credentialIssuer, admin, issuer2, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialIssuer.connect(admin).registerIssuer(issuer2.address, "Other Uni");

      await expect(
        credentialIssuer.connect(issuer2).revokeCredential(credentialId)
      ).to.be.revertedWith("Only credential issuer can revoke");
    });

    it("should revert if credential already revoked", async function () {
      const { credentialIssuer, issuer1, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialIssuer.connect(issuer1).revokeCredential(credentialId);
      await expect(
        credentialIssuer.connect(issuer1).revokeCredential(credentialId)
      ).to.be.revertedWith("Credential already revoked");
    });

    it("should revert if non-issuer user tries to revoke", async function () {
      const { credentialIssuer, other, credentialId } = await loadFixture(deployWithCredentialFixture);

      await expect(
        credentialIssuer.connect(other).revokeCredential(credentialId)
      ).to.be.revertedWith("Only credential issuer can revoke");
    });
  });

  describe("verifyCredential", function () {
    it("should return valid for an active credential", async function () {
      const { credentialIssuer, credentialId, holderDID } = await loadFixture(deployWithCredentialFixture);

      const [exists, valid, institutionName, holder, credType] = await credentialIssuer.verifyCredential(credentialId);
      expect(exists).to.be.true;
      expect(valid).to.be.true;
      expect(institutionName).to.equal("Test University");
      expect(holder).to.equal(holderDID);
      expect(credType).to.equal("Bachelor's Degree");
    });

    it("should return invalid for a revoked credential", async function () {
      const { credentialIssuer, issuer1, credentialId } = await loadFixture(deployWithCredentialFixture);

      await credentialIssuer.connect(issuer1).revokeCredential(credentialId);

      const [exists, valid, , ] = await credentialIssuer.verifyCredential(credentialId);
      expect(exists).to.be.true;
      expect(valid).to.be.false;
    });

    it("should return invalid for an expired credential", async function () {
      const { credentialIssuer, didRegistry, issuer1, holder } = await loadFixture(deployWithIssuerFixture);
      const holderDID = "did:holder:expiry";
      await didRegistry.connect(holder).createDID(holderDID, "ep");

      const futureTime = (await time.latest()) + 3600; // 1 hour from now
      await credentialIssuer.connect(issuer1).issueCredential(
        "cred-expiring", holderDID, "Cert", "{}", futureTime
      );

      // Fast forward past expiration
      await time.increase(3601);

      const [exists, valid, , ] = await credentialIssuer.verifyCredential("cred-expiring");
      expect(exists).to.be.true;
      expect(valid).to.be.false;
    });

    it("should return not exists for a non-existent credential", async function () {
      const { credentialIssuer } = await loadFixture(deployFixture);

      const [exists, valid, institutionName, holderDID, credType] = await credentialIssuer.verifyCredential("nonexistent");
      expect(exists).to.be.false;
      expect(valid).to.be.false;
      expect(institutionName).to.equal("");
      expect(holderDID).to.equal("");
      expect(credType).to.equal("");
    });

    it("should return valid for credential with no expiration", async function () {
      const { credentialIssuer, credentialId } = await loadFixture(deployWithCredentialFixture);

      // Fast forward a long time
      await time.increase(365 * 24 * 60 * 60);

      const [exists, valid, , ] = await credentialIssuer.verifyCredential(credentialId);
      expect(exists).to.be.true;
      expect(valid).to.be.true;
    });
  });

  describe("getHolderCredentials", function () {
    it("should return empty array for DID with no credentials", async function () {
      const { credentialIssuer } = await loadFixture(deployFixture);

      const creds = await credentialIssuer.getHolderCredentials("did:empty");
      expect(creds.length).to.equal(0);
    });

    it("should return all credential IDs for a holder", async function () {
      const { credentialIssuer, holderDID, credentialId } = await loadFixture(deployWithCredentialFixture);

      const creds = await credentialIssuer.getHolderCredentials(holderDID);
      expect(creds.length).to.equal(1);
      expect(creds[0]).to.equal(credentialId);
    });
  });

  describe("getCredential", function () {
    it("should return the full credential", async function () {
      const { credentialIssuer, credentialId, holderDID, issuer1 } = await loadFixture(deployWithCredentialFixture);

      const cred = await credentialIssuer.getCredential(credentialId);
      expect(cred.credentialId).to.equal(credentialId);
      expect(cred.holderDID).to.equal(holderDID);
      expect(cred.issuerAddress).to.equal(issuer1.address);
    });

    it("should revert if credential does not exist", async function () {
      const { credentialIssuer } = await loadFixture(deployFixture);

      await expect(
        credentialIssuer.getCredential("nonexistent")
      ).to.be.revertedWith("Credential does not exist");
    });
  });

  describe("isAuthorizedIssuer", function () {
    it("should return true for an authorized issuer", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      expect(await credentialIssuer.isAuthorizedIssuer(issuer1.address)).to.be.true;
    });

    it("should return false for a non-authorized address", async function () {
      const { credentialIssuer, other } = await loadFixture(deployFixture);

      expect(await credentialIssuer.isAuthorizedIssuer(other.address)).to.be.false;
    });

    it("should return false for a deauthorized issuer", async function () {
      const { credentialIssuer, issuer1 } = await loadFixture(deployWithIssuerFixture);

      await credentialIssuer.deauthorizeIssuer(issuer1.address);
      expect(await credentialIssuer.isAuthorizedIssuer(issuer1.address)).to.be.false;
    });
  });
});
